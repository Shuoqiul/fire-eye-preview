# Official numerical expectations

These CSV fixtures are screened subsets of the CFFDRS reference tables:

- [HourlyFineFuelMoistureCode.csv](https://github.com/cffdrs/cffdrs_r/blob/4d20a303bf94febccce62f068cc8ffad0fec57c1/tests/testthat/data/HourlyFineFuelMoistureCode.csv): 690 of 3,153 rows, retaining a numerical expectation, FFMC in [0,101], relative humidity in [0,100], nonnegative wind and rainfall, and a time step in [0,1] hour.
- [InitialSpreadIndex.csv](https://github.com/cffdrs/cffdrs_r/blob/4d20a303bf94febccce62f068cc8ffad0fec57c1/tests/testthat/data/InitialSpreadIndex.csv): all 2,921 in-domain numerical cases.

The files retain the source column names and rounded numerical expectations.
They check implementation agreement rather than observational predictive skill.
The CFFDRS source license accompanies these fixtures as `LICENSE.cffdrs.md`.
