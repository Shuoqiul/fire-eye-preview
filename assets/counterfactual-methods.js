'use strict';
/*
 * Fire Eye research formulas. Quantities retain their native physical units.
 * A numerical scenario output is conditional on the supplied inputs and
 * weather sequence; it is distinct from a calibrated operational forecast.
 */
(function(root){
  const FFMC_COEFFICIENT=250*59.5/101;
  const DAILY_DELAY_COUNTS=Object.freeze([2314,843,256,132,101,80]);
  const FFMC_INITIAL=85;
  const DELAY_INTERCEPT=-2.6257904808710437;
  const DELAY_SLOPE=.602613488993123;

  const provenance=Object.freeze({
    version:'2026-11-16',
    sourceKind:Object.freeze({
      P:'Published equation or author program; constants retain source values.',
      F:'Fit to deposited data with an explicitly stated estimand.',
      D:'Numerical or scenario convention made by this project.',
      G:'Output depends on matching data, calibration or external validation.'
    }),
    hffmc:Object.freeze({
      kind:'P',source:'Van Wagner (1977); CFFDRS cffdrs_r hourly_fine_fuel_moisture_code.r',
      tree:'4d20a303bf94febccce62f068cc8ffad0fec57c1',
      github:'https://github.com/cffdrs/cffdrs_r/blob/main/R/hourly_fine_fuel_moisture_code.r',
      units:'FFMC, °C, %, 10 m km/h, interval mm, hours',
      inputMeaning:'FFMC is the start-of-interval value; rainfall is accumulated during the interval.',
      initialFFMC:FFMC_INITIAL,
      initialCondition:'Fixed FFMC=85 is a conditional initialization used when antecedent state is unavailable.'
    }),
    isi:Object.freeze({
      kind:'P',source:'Van Wagner & Pickett (1985) Eqs.24–26; FCFDG (1992) Eq.53a',
      github:'https://github.com/cffdrs/cffdrs_r/blob/main/R/initial_spread_index.r',
      unit:'native ISI index',occupancyStatus:'The index is a mechanism diagnostic; the mapped endpoint requires separate calibration.'
    }),
    rcliper:Object.freeze({
      kind:'P',source:'Tuleya et al. (2007) Eqs.3–5, Table 2 NHC coefficients',
      doi:'10.1175/WAF972.1',doiUrl:'https://doi.org/10.1175/WAF972.1',unit:'maximum 1-min wind kt, radius km, conditional rain mm/h',
      regime:'Azimuthal climatological profile; terrain and rain-band structure remain outside this radial formula.',
      support:'35 <= Vmax <= 150 kt'
    }),
    hurricane:Object.freeze({
      kind:'P',source:'Knaff et al. (2007) Eq.1, Table 1 North Atlantic coefficients',
      doi:'10.1175/WAF1026.1',doiUrl:'https://doi.org/10.1175/WAF1026.1',
      unit:'wind kt, radius km, translation kt, angle °',
      regime:'North Atlantic; user supplies intensity and motion. Vector direction is a separate scenario convention.',
      angleConvention:'Rotated radial azimuth; theta0 is measured counterclockwise from 90° right of storm motion.'
    }),
    discovery:Object.freeze({
      kind:'F',source:'Kalashnikov et al. (2023), Zenodo 8019079',
      dataSha256:'37edd954ccce1e8d0022b340bf60782952ad2dd00af6d894d1207c0a401a8e57',
      estimand:'P(calendar-day lag | already matched and reported fire), lag 0..5'
    }),
    halfDay:Object.freeze({
      kind:'D',assumption:'Each calendar-day mass is assigned equally to its two halves; no event-level discovery time is available.'
    }),
    areaMixture:Object.freeze({
      kind:'D',meaning:'Expected point outcome over a treated fraction; the treated outcome retains its sign.'
    })
  });

  function finite(name,value){
    if(typeof value!=='number'||!Number.isFinite(value))throw new RangeError(`${name} must be a finite number`);
    return value;
  }
  function domain(name,value,low,high,openLow=false,openHigh=false){
    finite(name,value);
    if(value<low||value>high||(openLow&&value===low)||(openHigh&&value===high))
      throw new RangeError(`${name} lies outside its formula domain [${low}, ${high}]`);
    return value;
  }
  function boolean(name,value){
    if(typeof value!=='boolean')throw new TypeError(`${name} must be boolean`);
    return value;
  }
  function moistureFromFFMC(ffmc){
    domain('FFMC',ffmc,0,101);
    if(ffmc===101)return 0;
    return FFMC_COEFFICIENT*(101-ffmc)/(59.5+ffmc);
  }
  function ffmcFromMoisture(moisture){
    domain('moisture',moisture,0,250);
    return Math.max(0,59.5*(250-moisture)/(FFMC_COEFFICIENT+moisture));
  }
  function hourlyRainMoisture(moisture,rainMm){
    domain('moisture',moisture,0,250);
    domain('rainMm',rainMm,0,Infinity);
    if(rainMm===0)return moisture;
    if(moisture===250)return 250;
    let wet=42.5*rainMm*Math.exp(-100/(251-moisture))*(-Math.expm1(-6.93/rainMm));
    if(moisture>150)wet+=.0015*(moisture-150)**2*Math.sqrt(rainMm);
    return Math.min(250,moisture+wet);
  }

  function hourlyFFMC(previous,tempC,rhPct,windKmh,rainMm,hours=1){
    domain('previous FFMC',previous,0,101);
    finite('temperature °C',tempC);
    domain('RH %',rhPct,0,100);
    domain('10 m wind km/h',windKmh,0,Infinity);
    domain('interval rain mm',rainMm,0,Infinity);
    domain('hours',hours,0,1);
    const m=hourlyRainMoisture(moistureFromFFMC(previous),rainMm);
    const thermal=.18*(21.1-tempC)*(-Math.expm1(-.115*rhPct));
    const ed=.942*Math.pow(rhPct,.679)+11*Math.exp((rhPct-100)/10)+thermal;
    const ew=.618*Math.pow(rhPct,.753)+10*Math.exp((rhPct-100)/10)+thermal;
    let next=m;
    if(m>ed){
      const ko=.424*(1-Math.pow(rhPct/100,1.7))
        +.0694*Math.sqrt(windKmh)*(1-Math.pow(rhPct/100,8));
      next=ed+(m-ed)*Math.pow(10,-ko*.0579*Math.exp(.0365*tempC)*hours);
    }else if(m<ew){
      const x=(100-rhPct)/100;
      const ko=.424*(1-Math.pow(x,1.7))
        +.0694*Math.sqrt(windKmh)*(1-Math.pow(x,8));
      next=ew-(ew-m)*Math.pow(10,-ko*.0579*Math.exp(.0365*tempC)*hours);
    }
    return ffmcFromMoisture(next);
  }

  /** Interpolate magnitudes and shortest-arc directions with no spurious calm band. */
  function blendWindVectors(u0,v0,ut,vt,alpha){
    for(const [name,value] of [['u0',u0],['v0',v0],['ut',ut],['vt',vt],['alpha',alpha]])finite(name,value);
    if(alpha<0||alpha>1)throw new RangeError('alpha lies outside its formula domain [0, 1]');
    if(alpha===0)return [u0,v0];
    if(alpha===1)return [ut,vt];
    const speed0=Math.hypot(u0,v0),speedT=Math.hypot(ut,vt),speed=(1-alpha)*speed0+alpha*speedT;
    if(speed===0)return [0,0];
    const angle0=Math.atan2(v0,u0),angleT=Math.atan2(vt,ut);
    if(speed0===0)return [speed*Math.cos(angleT),speed*Math.sin(angleT)];
    if(speedT===0)return [speed*Math.cos(angle0),speed*Math.sin(angle0)];
    const cosine=Math.cos(angleT-angle0),sine=Math.sin(angleT-angle0);
    const shortest=cosine<0&&Math.abs(sine)<1e-14?Math.PI:Math.atan2(sine,cosine);
    const angle=angle0+alpha*shortest;
    return [speed*Math.cos(angle),speed*Math.sin(angle)];
  }
  function fineFuelFactor(m){
    domain('moisture',m,0,250);
    return 91.9*Math.exp(-.1386*m)*(1+Math.pow(m,5.31)/49300000);
  }
  function initialSpreadIndex(ffmc,windKmh,fbpMod=false){
    domain('FFMC',ffmc,0,101);
    domain('10 m wind km/h',windKmh,0,Infinity);
    boolean('fbpMod',fbpMod);
    const m=moistureFromFFMC(ffmc);
    const fw=fbpMod&&windKmh>=40?12*(-Math.expm1(-.0818*(windKmh-28))):Math.exp(.05039*windKmh);
    return .208*fw*fineFuelFactor(m);
  }
  /* This classic coefficient ratio belongs to native ISI; a probability requires separate calibration. */
  function windLogRatio(targetKmh,referenceKmh=10){
    domain('target wind km/h',targetKmh,0,Infinity);
    domain('reference wind km/h',referenceKmh,0,Infinity);
    return .05039*(targetKmh-referenceKmh);
  }

  function rcliperParameters(vmaxKt){
    domain('maximum wind kt',vmaxKt,35,150);
    const u=1+(vmaxKt-35)/33;
    return Object.freeze({
      vmaxKt,t0InDay:-1.10+3.96*u,tmInDay:-1.60+4.80*u,
      rmKm:64.5-13*u,reKm:150-16*u
    });
  }
  function rcliperRainRate(vmaxKt,radiusKm,options={}){
    domain('radius km',radiusKm,0,Infinity);
    if(options===null||typeof options!=='object'||Array.isArray(options))throw new TypeError('options must be an object');
    const coefficientGroup=options.coefficientGroup??'NHC';
    if(coefficientGroup!=='NHC')throw new RangeError('NHC operational coefficients are the supported R-CLIPER version');
    const p=rcliperParameters(vmaxKt);
    const daily=radiusKm<=p.rmKm
      ?p.t0InDay+(p.tmInDay-p.t0InDay)*radiusKm/p.rmKm
      :p.tmInDay*Math.exp(-(radiusKm-p.rmKm)/p.reKm);
    return daily*25.4/24;
  }

  const NAUTICAL_MILE_KM=1.852;
  function atlanticStormParameters(vmaxKt,lat,speedKt=12){
    domain('maximum wind kt',vmaxKt,0,Infinity);
    domain('latitude °',lat,0,90);
    domain('storm motion kt',speedKt,0,Infinity);
    const phi=lat-25;
    const rmNmi=Math.max(20,36.1-.0492*vmaxKt+.574*phi);
    const x=Math.min(1,.1147+.0055*vmaxKt-.001*phi);
    if(x<=0)throw new RangeError('Knaff size parameter x lies outside its required positive domain');
    const a=Math.max(0,1.06+.28*speedKt-.0026*speedKt**2-.08*phi);
    if(vmaxKt<=a)throw new RangeError('maximum wind must exceed the wavenumber-1 asymmetry amplitude');
    const theta0=17+.08*phi-1.05*speedKt;
    return Object.freeze({rmNmi,x,a,theta0});
  }
  function cycloneWind(vmaxKt,lat,radiusKm,thetaDeg,speedKt=12){
    domain('radius km',radiusKm,0,Infinity);
    finite('azimuth °',thetaDeg);
    const p=atlanticStormParameters(vmaxKt,lat,speedKt);
    const rNmi=radiusKm/NAUTICAL_MILE_KM;
    const symmetric=rNmi<=p.rmNmi
      ?(vmaxKt-p.a)*rNmi/p.rmNmi
      :(vmaxKt-p.a)*Math.pow(p.rmNmi/rNmi,p.x);
    const asymmetric=p.a*Math.cos((thetaDeg-p.theta0)*Math.PI/180);
    return Math.max(0,symmetric+asymmetric);
  }
  function cycloneRadius(vmaxKt,lat,thresholdKt,thetaDeg,speedKt=12){
    finite('azimuth °',thetaDeg);
    const p=atlanticStormParameters(vmaxKt,lat,speedKt);
    domain('wind threshold kt',thresholdKt,0,vmaxKt,true);
    const asym=p.a*Math.cos((thetaDeg-p.theta0)*Math.PI/180);
    const peak=vmaxKt-p.a+asym;
    if(peak<thresholdKt)return 0;
    if(peak<=0)return 0;
    if(thresholdKt<=asym)throw new RangeError('wind threshold lies below the directional asymmetry term');
    const rNmi=thresholdKt>=vmaxKt
      ?p.rmNmi*Math.pow((vmaxKt-p.a)/peak,1/p.x)
      :p.rmNmi*Math.pow((vmaxKt-p.a)/(thresholdKt-asym),1/p.x);
    return rNmi*NAUTICAL_MILE_KM;
  }

  function dailyDiscoveryKernel(){
    const total=DAILY_DELAY_COUNTS.reduce((sum,n)=>sum+n,0);
    return Object.freeze(DAILY_DELAY_COUNTS.map(n=>n/total));
  }
  function halfDayDiscoveryKernel(){
    const weights=Object.freeze(dailyDiscoveryKernel().flatMap(mass=>[mass/2,mass/2]));
    if(Math.abs(weights.reduce((a,b)=>a+b,0)-1)>1e-12)
      throw new RangeError('half-day delay kernel mass must equal one');
    return Object.freeze({weights,assumption:provenance.halfDay.assumption,convention:'D'});
  }
  function holdoverProbability(rainMm){
    domain('rain mm',rainMm,0,Infinity);
    const linear=DELAY_INTERCEPT+DELAY_SLOPE*Math.log1p(rainMm);
    return 1/(1+Math.exp(-linear));
  }
  function areaMixture(base,treated,fraction){
    domain('base outcome',base,0,Infinity);
    domain('treated outcome',treated,0,Infinity);
    domain('area fraction',fraction,0,1);
    return (1-fraction)*base+fraction*treated;
  }
  function odsShift(score,shift){
    domain('score',score,0,1);
    finite('odds shift',shift);
    if(shift===0)return score;
    const ratio=Math.exp(shift);
    return score*ratio/(1-score+score*ratio);
  }

  const defaults=Object.freeze({
    initialFFMC:FFMC_INITIAL,
    initialFFMCCondition:'Conditional FFMC=85 when the observed antecedent state is unavailable.',
    coastalRadiusKm:null,
    coastalRadiusCondition:'Research coastal grid and land mask must be supplied before a default coastal-placement claim.'
  });
  const api={
    FFMC_COEFFICIENT,DAILY_DELAY_COUNTS,provenance,defaults,
    moistureFromFFMC,ffmcFromMoisture,hourlyRainMoisture,hourlyFFMC,
    fineFuelFactor,initialSpreadIndex,windLogRatio,blendWindVectors,rcliperParameters,rcliperRainRate,
    atlanticStormParameters,cycloneWind,cycloneRadius,
    dailyDiscoveryKernel,halfDayDiscoveryKernel,holdoverProbability,areaMixture,
    oddsShift:function(score,shift){
      if(shift>1||shift<-1)throw new RangeError('odds shift lies outside [-1, 1]');
      return odsShift(score,shift);
    }
  };
  if(typeof module==='object'&&module.exports)module.exports=api;else root.FireMethods=api;
})(typeof window==='undefined'?globalThis:window);
