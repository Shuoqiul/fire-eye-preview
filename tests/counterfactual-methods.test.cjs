'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const m=require('../assets/counterfactual-methods.js');
const fixtureDir=path.join(__dirname,'fixtures','research-formulas');
function csv(name){
  const lines=fs.readFileSync(path.join(fixtureDir,name),'utf8').trim().split(/\r?\n/);
  const keys=lines.shift().trim().split(',');
  return lines.map(line=>Object.fromEntries(line.split(',').map((v,i)=>[keys[i],v])));
}
function close(actual,expected,tol=1e-10,label=''){
  assert.ok(Math.abs(actual-expected)<=tol,`${label}: ${actual} vs ${expected}, error ${Math.abs(actual-expected)} > ${tol}`);
}
function throwsRange(fn){assert.throws(fn,error=>error instanceof RangeError);}

test('official hFFMC table: 690 physical hourly rows within author-rounding tolerance',()=>{
  const rows=csv('hffmc_official_690.csv');
  assert.equal(rows.length,690);
  for(const r of rows){
    const actual=m.hourlyFFMC(+r.ffmc_old,+r.temp,+r.rh,+r.ws,+r.prec,+r['time.step']);
    const expected=+r.HourlyFineFuelMoistureCode,tolerance=Math.max(1e-8,6e-4*Math.abs(expected));
    close(actual,expected,tolerance,'official hFFMC');
  }
});
test('official ISI table: all 2921 physical rows match the author program and rounding',()=>{
  const rows=csv('isi_official_2921.csv');
  assert.equal(rows.length,2921);
  for(const r of rows){
    const actual=m.initialSpreadIndex(+r.ffmc,+r.ws,r.fbpMod==='TRUE');
    const expected=+r.InitialSpreadIndex,tolerance=Math.max(1e-8,6e-4*Math.abs(expected));
    close(actual,expected,tolerance,'official ISI');
  }
});

test('FFMC conversion and hourly wetting use the start-of-interval state',()=>{
  assert.equal(m.FFMC_COEFFICIENT,250*59.5/101);
  close(m.ffmcFromMoisture(0),101,1e-12);
  for(const value of [.5,16,85,150,200])close(m.moistureFromFFMC(m.ffmcFromMoisture(value)),value,1e-10,'round trip');
  const m0=m.moistureFromFFMC(85);
  assert.equal(m.hourlyRainMoisture(m0,0),m0);
  const light=m.hourlyFFMC(85,25,30,10,.2),none=m.hourlyFFMC(85,25,30,10,0),heavy=m.hourlyFFMC(85,25,30,10,10);
  assert.ok(light<none);assert.ok(heavy<light);
  close(m.hourlyRainMoisture(16,5),120.12893192799079,1e-10);
  close(m.hourlyRainMoisture(180,5),221.98553348452782,1e-10);
  assert.equal(m.hourlyRainMoisture(250,100),250);
  for(const value of [NaN,Infinity,-1])throwsRange(()=>m.hourlyFFMC(85,25,30,10,value));
  for(const value of [101.01,-.01])throwsRange(()=>m.hourlyFFMC(value,25,30,10,0));
  throwsRange(()=>m.hourlyFFMC(85,25,101,10,0));
  throwsRange(()=>m.hourlyFFMC(85,25,-1,10,0));
  throwsRange(()=>m.hourlyFFMC(85,25,30,-1,0));
  throwsRange(()=>m.hourlyFFMC(85,25,30,10,0,1.1));
  throwsRange(()=>m.hourlyFFMC(85,25,30,10,0,-.01));
});

test('ISI high wind branch and classic ratio preserve native output units',()=>{
  close(m.windLogRatio(20,10),.05039*10);
  close(m.initialSpreadIndex(85,20)/m.initialSpreadIndex(85,10),Math.exp(.05039*10));
  assert.ok(m.initialSpreadIndex(85,100,true)<m.initialSpreadIndex(85,100,false));
  close(m.fineFuelFactor(0),91.9);
  throwsRange(()=>m.fineFuelFactor(-1));throwsRange(()=>m.initialSpreadIndex(102,20));
  assert.equal(m.defaults.initialFFMC,85);
  assert.match(m.provenance.isi.occupancyStatus,/calibration/);
});

test('wind blending preserves speed through opposing and wrapped directions',()=>{
  const angle=value=>((value*180/Math.PI)%360+360)%360;
  for(const alpha of [0,.25,.5,.75,1]){
    const actual=m.blendWindVectors(-10,0,10,0,alpha);
    close(Math.hypot(...actual),10,1e-10,'opposing vector speed');
    assert.ok(Math.abs(actual[1])<=10+1e-10);
    assert.ok(alpha<=0||alpha>=1||Math.abs(actual[1])<=10+1e-10);
  }
  const half=m.blendWindVectors(-10,0,10,0,.5);
  close(Math.hypot(...half),10,1e-10,'antipode midpoint speed');
  close(half[1],-10,1e-10,'deterministic +pi tie');
  const reverseHalf=m.blendWindVectors(10,0,-10,0,.5);
  close(reverseHalf[1],10,1e-10,'reverse antipode maintains +pi');
  const wrapped=m.blendWindVectors(10*Math.cos(350*Math.PI/180),10*Math.sin(350*Math.PI/180),
    10*Math.cos(10*Math.PI/180),10*Math.sin(10*Math.PI/180),.5);
  close(Math.atan2(wrapped[1],wrapped[0]),0,1e-9,'short circular arc');
  close(Math.abs(wrapped[1]),0,1e-10,'wrapped midpoint latitude');
  close(Math.hypot(...wrapped),10,1e-10);
  const fromCalm=m.blendWindVectors(0,0,3,4,.25);close(Math.hypot(...fromCalm),1.25,1e-10);
  close(angle(Math.atan2(fromCalm[1],fromCalm[0])),53.13010235415598,1e-10,'target direction from calm');
  const intoCalm=m.blendWindVectors(3,4,0,0,.75);close(Math.hypot(...intoCalm),1.25,1e-10);
  close(angle(Math.atan2(intoCalm[1],intoCalm[0])),53.13010235415598,1e-10,'baseline direction into calm');
  assert.deepEqual(m.blendWindVectors(0,0,0,0,.4),[0,0]);
  assert.deepEqual(m.blendWindVectors(-2,3,4,-1,0),[-2,3]);
  assert.deepEqual(m.blendWindVectors(-2,3,4,-1,1),[4,-1]);
  for(const alpha of [-.1,1.1,NaN,Infinity])throwsRange(()=>m.blendWindVectors(1,2,3,4,alpha));
  for(const value of [NaN,-Infinity,Infinity])throwsRange(()=>m.blendWindVectors(value,2,3,4,.5));
});
test('R-CLIPER NHC coefficients use knots, kilometers and hourly millimeters',()=>{
  const p=m.rcliperParameters(80);
  close(p.t0InDay,-1.10+3.96*(1+45/33));
  close(p.tmInDay,-1.60+4.80*(1+45/33));
  close(p.rmKm,64.5-13*(1+45/33));
  close(p.reKm,150-16*(1+45/33));
  close(m.rcliperRainRate(80,0),p.t0InDay*25.4/24);
  close(m.rcliperRainRate(80,p.rmKm),p.tmInDay*25.4/24);
  for(const wind of [35,45,80,115,150]){
    const pp=m.rcliperParameters(wind);
    close(m.rcliperRainRate(wind,pp.rmKm-1e-7),m.rcliperRainRate(wind,pp.rmKm+1e-7),5e-7,'radial continuity');
    assert.ok(m.rcliperRainRate(wind,pp.rmKm)>m.rcliperRainRate(wind,pp.rmKm+100));
    assert.ok(m.rcliperRainRate(wind,pp.rmKm)>=m.rcliperRainRate(wind,0),'the NHC coefficients include a reduced central rain rate');
  }
  const p45=m.rcliperParameters(45);
  close(m.rcliperRainRate(45,p45.rmKm)/25.4*24,p45.tmInDay);
  throwsRange(()=>m.rcliperParameters(34.9));throwsRange(()=>m.rcliperParameters(150.1));
  throwsRange(()=>m.rcliperRainRate(80,-1));throwsRange(()=>m.rcliperRainRate(80,0,{coefficientGroup:'unvalidated'}));
  assert.match(m.provenance.rcliper.source,/Table 2 NHC/);
  assert.equal(m.provenance.rcliper.doi,'10.1175/WAF972.1');
});

test('North Atlantic Knaff geometry inverts wind radii and separates radial direction',()=>{
  const p=m.atlanticStormParameters(100,30,12);
  const x=.1147+.0055*100-.001*5,a=1.06+.28*12-.0026*144-.08*5;
  const rm=Math.max(20,36.1-.0492*100+.574*5),theta=17+.08*5-1.05*12;
  close(p.rmNmi,rm);close(p.x,x);close(p.a,a);close(p.theta0,theta);
  assert.ok(p.x>0&&p.x<=1);
  for(const thetaDeg of [0,45,p.theta0,135,270]){
    for(const q of [34,50,64]){
      const radius=m.cycloneRadius(100,30,q,thetaDeg,12);
      if(radius>0)close(m.cycloneWind(100,30,radius,thetaDeg,12),q,1e-10,'radius inversion');
    }
  }
  close(m.cycloneWind(100,30,0,p.theta0,12),Math.max(0,a),1e-10,'center is the exact inner-radius endpoint');
  const strong=m.atlanticStormParameters(200,25,12);
  assert.equal(strong.x,1);assert.ok(strong.x<=1);
  const rawX=.1147+.0055*200-.001*(25-25);
  assert.ok(rawX>1);
  const strongAsym=strong.a*Math.cos((strong.theta0+90-strong.theta0)*Math.PI/180);
  const expectedRadius=strong.rmNmi*((200-strong.a)/(100-strongAsym));
  close(m.cycloneRadius(200,25,100,strong.theta0+90,12)/1.852,
    expectedRadius,1e-10,'x=1 strong-storm radius');
  close(m.cycloneWind(200,25,expectedRadius*1.852,strong.theta0+90,12),100,1e-10);
  close(m.cycloneWind(100,30,1e9,p.theta0,12),Math.max(0,a),1e-2,'outer limit');
  let maxError=0;
  for(const lat of [18,25,32,40])for(const speed of [0,5,12,20])for(const thetaDeg of [0,90,180,270]){
    for(const q of [34,50,64]){
      const r=m.cycloneRadius(110,lat,q,thetaDeg,speed);
      if(r>0)maxError=Math.max(maxError,Math.abs(m.cycloneWind(110,lat,r,thetaDeg,speed)-q));
    }
  }
  assert.ok(maxError<1e-10);
  for(const lat of [10,20,30,40,50]){
    const pp=m.atlanticStormParameters(100,lat,12);
    close(pp.a,Math.max(0,1.06+.28*12-.0026*144-.08*(lat-25)));
  }
  throwsRange(()=>m.atlanticStormParameters(100,NaN));throwsRange(()=>m.atlanticStormParameters(100,91));
  throwsRange(()=>m.atlanticStormParameters(100,30,-1));throwsRange(()=>m.cycloneRadius(100,30,101,0,12));
  let domainErrors=0;
  for(const thetaDeg of [0,90,180,270])for(const q of [2,3,4,5,10]){
    try{m.cycloneRadius(20,30,q,thetaDeg,12);}catch(e){assert.ok(e instanceof RangeError);domainErrors++;}
  }
  assert.ok(domainErrors>0);
});

test('deposited discovery fit gives exact counts, mass and conditional lag probability',()=>{
  const expected=[2314,843,256,132,101,80];
  assert.deepEqual([...m.DAILY_DELAY_COUNTS],expected);
  assert.ok(Object.isFrozen(m.DAILY_DELAY_COUNTS));
  const k=m.dailyDiscoveryKernel(),total=expected.reduce((a,b)=>a+b,0);
  assert.equal(k.length,6);assert.ok(Object.isFrozen(k));
  for(let j=0;j<6;j++)close(k[j],expected[j]/total);
  close(k.reduce((a,b)=>a+b,0),1);
  close(k.slice(2).reduce((a,b)=>a+b,0),569/total);
  const half=m.halfDayDiscoveryKernel();
  assert.equal(half.weights.length,12);assert.equal(half.convention,'D');assert.match(half.assumption,/equally/);
  assert.ok(Object.isFrozen(half.weights));
  for(let j=0;j<6;j++){close(half.weights[2*j],k[j]/2);close(half.weights[2*j+1],k[j]/2);}
  close(half.weights.reduce((a,b)=>a+b,0),1);
  close(m.holdoverProbability(0),1/(1+Math.exp(-(-2.6257904808710437))));
  close(m.holdoverProbability(10),1/(1+Math.exp(-(-2.6257904808710437+.602613488993123*Math.log(11)))));
  assert.ok(m.holdoverProbability(10)>m.holdoverProbability(0));
  for(const value of [-.01,NaN,Infinity])throwsRange(()=>m.holdoverProbability(value));
});

test('area mixture is exact and retains positive or negative treatment changes',()=>{
  close(m.areaMixture(.4,.1,.25),.325);
  close(m.areaMixture(.4,.9,.25),.525);
  assert.equal(m.areaMixture(.4,.9,0),.4);assert.equal(m.areaMixture(.4,.1,1),.1);
  close(m.areaMixture(.4,.9,1)-m.areaMixture(.4,.9,0),.5);
  assert.equal(m.areaMixture(0,0,.5),0);
  for(const fraction of [-.1,1.1,NaN])throwsRange(()=>m.areaMixture(.4,.3,fraction));
  throwsRange(()=>m.areaMixture(-.1,.3,.5));throwsRange(()=>m.areaMixture(.4,Infinity,.5));
});

test('the research surface excludes prototype pseudo-probability and prototype treatment defaults',()=>{
  for(const key of ['memoryStep','lightningKernel','ignitionUnion','treatmentMixture'])
    assert.equal(Object.prototype.hasOwnProperty.call(m,key),false,`${key} defines a deprecated research coupling`);
  for(const key of ['initialMoisturePercent','rainTauHours','rainWeights','lightningHazard','rxLogOddsShift','rxHalfLifeYears'])
    assert.equal(Object.prototype.hasOwnProperty.call(m.defaults,key),false,`${key} remains a prototype default`);
  assert.equal(m.provenance.rcliper.kind,'P');assert.equal(m.provenance.discovery.kind,'F');
  assert.equal(m.provenance.halfDay.kind,'D');
});
