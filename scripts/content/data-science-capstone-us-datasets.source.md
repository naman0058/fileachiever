Useful data science capstone project ideas connect a question you can answer to data you can access. Forecasting NYC taxi pickups, classifying consumer complaints, and analyzing county housing costs are practical examples—but each needs a clear scope and an evaluation plan.

This guide compares ten options for US undergraduate seniors, master's students, and portfolio builders. Each includes a dataset, a proposed starting scope, and an output you can demonstrate. The scopes are study suggestions, not completed experiments or guaranteed academic requirements.

## Quick answer: which project should you choose?

For a beginner analytical capstone, consider an electricity-generation dashboard or a county housing-cost comparison. For machine learning, consider taxi-demand forecasting or complaint classification. For a more advanced project, investigate weather-sensitive electricity demand. Choose according to your skills, data access, and your program's evaluation requirements.

## Key takeaways

- Start with one location, a fixed period, and one research question.
- Predictive projects need a baseline and genuinely held-out evaluation.
- Analytical dashboards need validated calculations and clear limitations.
- Confirm fields, units, access, and missingness before writing your proposal.
- Demonstrate your own contribution through reproducible analysis and honest findings.

## Compare the ten project ideas

A data science capstone combines a research question, documented data, reproducible preparation, analysis or modeling, evaluation, and communication. Difficulty below is an editorial estimate for the suggested scope.

| Project | Dataset | Suggested skills | Difficulty | Main evaluation |
|---|---|---|---|---|
| 1. Taxi demand | NYC TLC yellow taxi records | Python, time series | Intermediate | MAE by zone and hour |
| 2. Trip duration | NYC TLC yellow taxi records | Python, regression | Intermediate | MAE and large-error cases |
| 3. Complaint classification | CFPB narratives | Python, text features | Intermediate | Macro-F1, class recall |
| 4. Complaint trends | CFPB complaint records | SQL, visualization | Beginner–intermediate | Totals and filter checks |
| 5. Electricity demand | EIA hourly demand | Python, time series | Intermediate | MAE, peak-period error |
| 6. Generation mix | EIA monthly generation | SQL, dashboard tool | Beginner | Source reconciliation |
| 7. Housing costs | ACS B25070 | Data cleaning, statistics | Beginner–intermediate | Denominator and uncertainty checks |
| 8. Internet subscriptions | ACS B28002 | Statistics, mapping | Intermediate | Sensitivity and uncertainty |
| 9. Weather anomalies | NOAA GHCN-Daily | Python, robust statistics | Intermediate | Flagged-case review |
| 10. Weather and demand | NOAA plus EIA | Data joins, regression | Advanced | Held-out MAE comparison |

**Mean absolute error (MAE)** measures average absolute prediction error in the target's units. **Macro-F1** averages class-level F1 scores equally, helping reveal performance beyond the largest category.

Use the project numbers to shortlist options. The repeated providers are intentional: forecasting, text modeling, descriptive analysis, and data integration demonstrate different skills even when they share a data source.

## 1. Forecast hourly NYC taxi pickups

**Research question:** How many recorded yellow-taxi pickups will five selected zones receive in the next hour?

**Data:** Download six consecutive months of yellow-taxi Parquet files from the NYC Taxi and Limousine Commission trip-record page. Consult its yellow-taxi dictionary and zone lookup. Use pickup timestamps and pickup-zone IDs.

**Build:** Aggregate trips into zone-hour counts. Use months 1–4 for training, month 5 for validation, and month 6 for testing. Compare the same hour one week earlier with a model using calendar variables and past counts. At every prediction, use only information available before that hour.

This project simulates next-hour predictions using historical records. A live deployment would require a timely pickup-data feed; published monthly files alone cannot supply current pickup counts.

Six months provides a manageable prototype, but it does not establish performance across a full annual seasonal cycle.

**Evaluate and deliver:** Report MAE overall and by zone, alongside observed-versus-predicted charts. Distinguish missing source coverage from real zero-pickup hours. The output estimates recorded pickups, not unmet transportation demand. Read selected columns and process one month at a time if memory is limited.

## 2. Predict taxi trip duration

**Research question:** Given a pickup zone, a user-supplied destination zone, and departure time, how accurately can you estimate trip duration?

**Data:** Use TLC yellow-taxi trip records for three complete months. Calculate the target from drop-off minus pickup time; document invalid timestamp and duration exclusions.

**Build:** Train on month 1, validate on month 2, and test on month 3. Compare training-set route medians with a tree-based regressor. Use a training-set overall median when a route has no history.

**Evaluate and deliver:** Report MAE in minutes and inspect the largest errors. Create a small estimator showing its inputs and limitations. Exclude actual completed-trip distance, final fare, and drop-off time from input features. The recorded destination represents the destination supplied by the user in this proposed scenario.

## 3. Classify consumer complaint narratives

**Research question:** Can a published complaint narrative be assigned to one of five selected product categories?

**Data:** Use the Consumer Financial Protection Bureau complaint database, selecting records with a published narrative and product label. Freeze a dated extract and document which labels you keep or combine.

**Build:** Remove duplicate complaint IDs and exact duplicate normalized narratives before splitting. Train on earlier records, validate on a later interval, and reserve the newest interval for testing. Check that every target category appears in training. Fit TF-IDF text features and logistic regression on training data only.

**Evaluate and deliver:** Report macro-F1, class recall, class sizes, and a confusion matrix. Inspect near-duplicate text and mistaken categories. Build a classifier demo with an error-analysis note. Predictions reproduce selected dataset labels; they do not determine complaint validity.

## 4. Explore consumer complaint trends

**Research question:** How does the complaint mix within one product family change over two complete years?

**Data:** Download a dated CFPB complaint extract. Retain complaint ID, date received, product, and issue. Use all selected complaint records for counts, rather than restricting counts to records with narratives.

**Build:** Calculate monthly totals and issue shares. Document category changes and incomplete periods before comparing trends.

**Evaluate and deliver:** Reconcile monthly totals with the extract and manually test representative dashboard filters. Produce an interactive dashboard and a short findings memo. CFPB cautions that complaints are not representative of all consumer experiences; raw counts should not become a company-quality ranking.

## 5. Forecast regional electricity demand

**Research question:** Can recent demand and calendar patterns improve a next-hour forecast for one balancing authority area?

**Data:** Start with the US Energy Information Administration's hourly regional electricity data. Select a demand series and one area, such as California Independent System Operator where available. Save selected filters, timestamps, units, and extraction date.

**Build:** Propose two complete years: the first 18 months for training, the next three for validation, and the last three for testing. Compare the same hour one week earlier with a calendar-and-lag model. Use one consistent time convention.

**Evaluate and deliver:** Show overall MAE and errors during peak-demand hours, defining the peak threshold from training data. Include a forecast chart and failure analysis. Historical backtesting must account for data-release delays and revisions before it can represent a live forecasting system.

## 6. Compare state electricity-generation mixes

**Research question:** How have fuel shares changed across three selected states?

**Data:** Use EIA's monthly electric-power operational data. Select generation, consistent state geography, sector coverage, and three complete years. Preserve the returned unit labels.

**Build:** Calculate fuel shares within each state-month. Avoid summing an all-fuels total together with its component categories. Keep missing values distinct from zero generation.

**Evaluate and deliver:** Reconcile component totals with the equivalent source total and document any differences. Build a dashboard with fuel shares, total generation, and downloadable filtered results. Explain whether a share changed because that fuel increased or other generation decreased. Confirm that your program accepts a descriptive capstone.

## 7. Analyze county rental-cost burdens

**Research question:** What share of renter-occupied households with a computed rent-to-income ratio spends at least 30% of income on gross rent?

**Data:** Begin with the 2023 ACS five-year table B25070, covering 2019–2023, for counties in one state. Retain estimates, margins of error, and geography identifiers. This fixed release is a reproducible starting point, not a claim that it is the newest release.

**Build:** Sum the categories starting at 30%. Divide by total renter-occupied units minus “not computed.” Label this denominator explicitly and show exclusions. The B25070 variable dictionary identifies the categories used below.

Rent-burden percentage =
100 × (B25070_007E + B25070_008E + B25070_009E + B25070_010E)
÷ (B25070_001E − B25070_011E)

Return no estimate when the denominator is zero or required values are missing or flagged. Do not calculate uncertainty by simply adding margins of error.

**Illustrative calculation—not observed Census results:** If a county has 1,000 renter-occupied units, 100 with no computed ratio, and 360 at or above 30%, the proposed measure is 360 ÷ 900 = 40%. Dividing by all 1,000 units answers a different question.

**Evaluate and deliver:** Verify the calculation against the table and follow ACS guidance when deriving uncertainty. Create a county comparison with a methodology note. This measures renter cost burden, not the entire housing market.

## 8. Map household internet-subscription gaps

**Research question:** Which counties in one state have lower household internet-subscription rates?

**Data:** Use the same ACS five-year release throughout. The 2023 B28002 variable dictionary identifies total households and households with an internet subscription. Retain matching margins of error.

**Build:** Calculate subscription share as B28002_002E divided by B28002_001E. Join geography using identifiers rather than names. Treat missing or special values before arithmetic, and match boundary definitions to the selected release.

**Evaluate and deliver:** Check joins, denominator validity, and whether conclusions change when highly uncertain estimates are excluded. Deliver a map, accessible comparison table, and uncertainty note. Internet subscription is distinct from connection speed, infrastructure availability, or an individual household's reasons for lacking access.

## 9. Detect unusual daily weather observations

**Research question:** Which daily maximum temperatures differ unusually from a station's seasonal pattern?

**Data:** Select a US station with adequate coverage from NOAA GHCN-Daily. Use TMAX, station metadata, and quality flags; consult the format documentation for units and missing-value codes.

For the linked .dly format, treat -9999 as missing before calculations and divide valid TMAX values by 10 to obtain degrees Celsius. Document how quality flags affect inclusion.

**Build:** Propose ten earlier years as a seasonal reference and one later year for review. Compare each observation with a day-of-year neighborhood using a median and robust spread estimate. Define a fallback when the spread is zero and handle leap days explicitly. Set the anomaly threshold using only the earlier reference years, before inspecting the review year; keep it fixed during evaluation.

**Evaluate and deliver:** Review flagged dates, nearby stations, and data-quality context. Create an anomaly explorer with the reason for each flag. Without independently labeled events, report review findings rather than claiming disaster-detection accuracy. An unusual observation may be genuine weather or a measurement problem.

## 10. Investigate weather-sensitive electricity demand

**Research question:** Does temperature explain regional daily electricity demand beyond calendar and demand-history features?

**Data:** Combine one EIA demand area with appropriately matched NOAA weather stations. Document station selection and aggregate both sources into aligned daily periods with explicit units.

Define whether the target is total daily energy or average daily demand, and label the units accordingly. Document missing hours, daylight-saving transitions, and the observation periods represented by weather records before joining dates.

**Build:** Use three complete years if coverage permits: two for development with chronological validation, one for final testing. Compare identical calendar-and-demand-history inputs with and without temperature. Keep sample dates and evaluation periods identical.

**Evaluate and deliver:** Report held-out MAE by season and test sensitivity to station selection. If temperature comes from the same day's observed weather, describe the model as retrospective. A future forecast needs weather forecasts archived as available at the prediction time, or appropriately lagged observations. Deliver a comparison report that makes this distinction visible.

## Turn your shortlist into a working capstone

1. **Inspect one extract.** Confirm fields, coverage, units, and access before committing. Produce a data inventory with a small preview.
2. **Write a one-paragraph proposal.** Name the question, intended user, geography, period, comparison, and output. Get your advisor's scope feedback.
3. **Freeze evaluation rules.** Record split dates, prediction horizon, exclusions, and metrics before model tuning. Descriptive projects should define reconciliation and uncertainty checks instead.
4. **Build the smallest complete workflow.** Connect raw data to one result and a simple output. Python with pandas and scikit-learn is one modeling option; SQL and a dashboard tool can suit analytical work.
5. **Investigate failures.** Examine weak routes, categories, seasons, or joins. Produce an error table with explanations supported by the data.
6. **Package the submission.** Include a README, environment instructions, source links, data manifest, preparation scripts, evaluation outputs, limitations, and a presentation. Keep API credentials out of the repository.

For more help assessing feasibility, use FileMakr's [guide to choosing a data science capstone](https://www.filemakr.com/blog/how-to-choose-data-science-capstone-project).

## Common mistakes and advanced improvements

**Learning preprocessing from the test set:** Fit transformations on training data only. A pipeline helps keep preprocessing and modeling together; see scikit-learn's common pitfalls.

**Treating missing observations as zeros:** First establish what an absent record means. A missing source file is different from an hour with no pickups.

**Mixing survey products or periods:** Use a consistent ACS release and geography. Overlapping five-year estimates are not independent annual snapshots.

**Choosing a model before defining the forecast:** Write down when the prediction is made and which inputs exist then. This prevents completed-trip information or future observed weather from entering a supposed future forecast.

For an advanced capstone, add one defensible extension: rolling-origin evaluation, prediction-interval coverage, uncertainty sensitivity, or transfer to a second location. Hold the base question fixed so the extension yields an interpretable comparison.

## Frequently asked questions

### Are these datasets free to access?

The linked government sources offer public data access. Inspect each product's documentation, attribution requirements, formats, and access limits. Public access does not mean every dataset is small enough to process comfortably on a laptop.

### Do I need an API key?

It depends on the access route. TLC files, CFPB downloads, and NOAA GHCN bulk files provide download-based starting points. EIA offers API-key registration through its Open Data portal. Check current requirements for any API you choose rather than assuming all routes work alike.

### Which project is best for beginners?

A narrowly scoped generation-mix dashboard or rental-cost comparison is a reasonable starting point if you understand data cleaning and basic statistics. Analytical projects still require checked calculations, interpretation, and advisor approval.

### Do I need deep learning?

No. Start with a method suited to the question and data. A well-evaluated baseline and a clear explanation of its failures can be more useful than a complex model without credible evaluation.

### Can a dashboard qualify as a capstone?

Yes, when your program permits it and the work contains substantial data preparation, defensible analysis, and a research question. A collection of charts alone may not satisfy the rubric.

### How can I make a familiar project original?

Define a specific contribution: a new geographic comparison, careful uncertainty analysis, a reproducible pipeline, or a documented failure investigation. Explain what your work adds and cite reused code and methods.

### Can I finish one of these in a semester?

A narrow scope may fit a semester, but feasibility depends on your skills, team, data quality, and course requirements. Confirm access early and complete one end-to-end version before adding models or locations.

### Does my model have to outperform its baseline?

An honest negative result can still provide useful findings when evaluation is sound and the reasons are examined. Whether it satisfies your capstone depends on your program's assessment criteria.

## Choose a project you can evaluate

Shortlist two ideas, inspect a sample from each dataset, and draft a proposal covering the question, scope, evaluation, and output. Choose the one with the clearest path to a reproducible result.

Need implementation references? Explore [FileMakr's Python project resources](https://www.filemakr.com/source-code/python) and check whether an available example fits your workflow. Follow your course's reuse rules, cite original work, and explain your own contribution.

<!-- PUBLIC ARTICLE END -->
