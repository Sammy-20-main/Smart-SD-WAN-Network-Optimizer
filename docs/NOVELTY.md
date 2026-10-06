# What is new in this project

Classic RNSR (Relay Node Selection and Routing) answers one question: which path
uses the fewest relay nodes while its **average** latency stays under the SLA limit?

Waypoint keeps that algorithm (Module 3) as the baseline and adds five things on top. Items 1 and 4 are the main contributions; 4 and 5 turn the model from a simulation into something driven by data.

## 1. Chance-constrained RNSR (CC-RNSR)

**Gap.** A route that meets the limit on paper can still break it half the time,
because real links jitter. Classic RNSR treats every link latency as a fixed number.

**Method.**
1. Every link's latency is modelled as log-normal, with its mean set to the
   configured latency and its spread set by the link's jitter (default 15% of latency).
2. 4,000 Monte Carlo trials draw one sample per link. All candidate routes share the
   same per-link samples (common random numbers), so route comparisons are fair
   and the output is repeatable (seeded PRNG, seed 2026).
3. Each route gets an SLA confidence: the share of trials where its end-to-end
   latency stays within the limit.
4. The risk-aware pick is the route with the fewest relays whose confidence is at
   least the target (default 95%). Ties go to lower cost, then lower tail latency.
   If no route reaches the target, the most confident compliant route is used.

**Price of confidence.** The report states what the extra safety costs: extra
relays, extra monthly cost, extra latency and confidence gained, compared with the
classic pick. Example (multi-cloud mesh preset, 125 ms limit): the classic route
is 106 ms but only 92.4% on time; the risk-aware route is 113 ms, costs $450 more
a month, uses one more relay and is 98% on time.

## 2. N-1 failure drills

Each relay and link on the chosen route is removed in turn and the engine
re-optimises. Every drill ends as *survives* (SLA kept), *degraded* (connected but
over the limit) or *disconnected*. The resilience score is the share of drills
survived. The report also counts node-disjoint paths (max-flow, Menger's theorem)
and lists single points of failure and the failover route for each drill.

## 3. Transparent network health score

A weighted blend of four 0 to 100 parts: links on the route (30%), survives single
failures (25%), redundancy (20%) and SLA confidence (25%). The weights are fixed
and shown in the UI so the number can be explained line by line.

## 4. Expected-cost routing

**Gap.** Chance-constrained routing needs a confidence target (95%) that someone has
to choose, and it ignores what a breach actually costs.

**Method.** Put a price P on one SLA breach per month. Each route is scored as

    expectedCost(route) = monthlyCost(route) + P x (1 - confidence(route))

and the engine picks the minimum, ties going to fewer relays then lower latency.
A safer, dearer route wins exactly when the breaches it prevents are worth more than
its extra cost. Because expectedCost is a straight line in P for every route, the
optimal route as a function of P is the lower envelope of those lines. The report
computes it (the "decision map") and the break-even penalty against the classic pick:

    P* = (cost_safe - cost_classic) / (confidence_safe - confidence_classic)

Example (mesh preset): the cheap $700 route is optimal up to about $6,600 per breach
per month; above that the $1,160 route is optimal. Both statements are tested.

## 5. Jitter learned from measurements

**Gap.** The Monte Carlo model needs a latency distribution per link, and a guess
of "15% of latency" is only a placeholder.

**Method.** Measured round-trip samples are stored per link in the database. For
each link with at least 8 samples the engine fits a log-normal by maximum
likelihood (mu = mean of ln x, sigma = standard deviation of ln x), converts it to
a mean and standard deviation in milliseconds, and writes the jitter (optionally
the latency too) back to the link. Every later analysis then uses fitted values.
A test fits 4,000 synthetic samples and recovers the true mean and spread.

## Honest limits

- Jitter and utilisation are configured or simulated, not measured. Real telemetry
  would replace the 15% default.
- Paths are enumerated by depth-first search (capped at 5,000), so this suits
  topologies of tens of nodes, not thousands.
- Latencies are assumed independent between links.
- The breach penalty is a number the user supplies; the project does not estimate it.
- The built-in demo measurements are simulated and labelled as such. The fit itself is real, but real network traces would be needed to claim real-world accuracy.

## Where to find it in the code

| Idea | File |
| --- | --- |
| Monte Carlo and risk-aware pick | `backend/services/analytics/riskAnalysis.js` |
| Failure drills, disjoint paths | `backend/services/analytics/resilienceAnalysis.js`, `graphUtils.js` |
| Expected-cost routing, decision map | `backend/services/analytics/riskAnalysis.js` (`analyzeExpectedCost`) |
| Telemetry fitting | `backend/services/analytics/telemetry.js`, `backend/db/repository.js` |
| Health score | `backend/services/analytics/healthMonitor.js` |
| Orchestrator | `backend/services/analytics/analyticsEngine.js` |
| Tests | `scratch/test_module4.mjs`, `scratch/test_database.mjs` |
