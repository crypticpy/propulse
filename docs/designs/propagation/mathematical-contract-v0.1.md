# Mathematical contract — candidate 0.1

> Candidate technical design of record, protocol 0.1.0, 10 September 2026.
> Adopted for review under [#947](https://github.com/crypticpy/propulse/issues/947),
> not ratified. Independent scientific review and genuine Fable design approval
> are pending. No downstream solver build, release, training or activation is
> authorized by this candidate. The corrections/status below govern the inherited text.

## Governing status and corrections

“Normative candidate” means a constraint proposed for implementation after review,
not evidence that an implementation is compliant. All M01–M24 are retained below.
M01–M11, M19 and M24 are normative candidate contracts (including required source
and algorithm verification). M06 mirror geometry is an analytic fixture, not an
HF solver. M12–M18 and M20–M22 are experimental until their named observational,
calibration and causal gates pass. M23 is a candidate measurement contract;
its unresolved population/power/comparator gates are explicitly BLOCKED in
[protocol-v0.1.json](../../../ml/propagation_validation/protocol-v0.1.json).
The parameter-origin table below remains applicable; no numerical example is a
fitted default. Proposed module boundaries are schematic. Source revisions and
license statements inherited below are proposals to verify, not newly inspected assets.

### M12 correction: positive semidefinite covariance

For unit vectors u on the sphere, set x=6371u km and
`d_chord(i,j)=||x_i-x_j||=2R sin(theta_ij/2)`. The spatial squared exponential is
a Euclidean Gaussian restricted to these embedded points. Its product with the
temporal exponential is PSD by the Schur product property. This is mathematical
validity, not an empirical claim that chordal distance models ionospheric dependence.
See Gneiting (2013), [equation 7 and Example 1](https://arxiv.org/html/1111.7077v5):
chordal restriction preserves positive definiteness; geodesic powered exponential
with exponent greater than one does not define a globally valid spherical covariance.

Counterexample: four equatorial points at longitudes 0, 90, 180, 270 degrees,
R=6371 km, ell=15000 km, sigma=1, identical times. For geodesic SE the circulant
first row is `[1,a,b,a]`, with `a=exp(-(pi R/2)^2/(2 ell^2))` and
`b=exp(-(pi R)^2/(2 ell^2))`. The vector `[1,-1,1,-1]` has eigenvalue
`1-2a+b=-0.19037664870820725`. Tiny diagonal jitter cannot repair this invalid
model. The chordal counterpart has `a=exp(-R^2/ell^2)`, `b=a^2`, and eigenvalues
`(1+a)^2`, `1-b` (twice), `(1-a)^2`, all nonnegative. Independent algebraic
fixtures also exercise duplicate sites, poles, the date line and unequal times.

Require finite positive ell/tau, nonnegative sigma, PSD observation covariance,
consistent log-parameter units and valid coordinates. Duplicate observations can
make K singular; a PSD matrix need not be invertible. The update is disabled if
factorization/conditioning fails, with provenance. This slice implements only
small analytic covariance checks, not assimilation or an observation-error model.

### M23 correction: measurement and qualification

Ordinary MAE requires measured SNR, including exposures that fail to decode if
those exposures are in the target population. A threshold bound on a failed
detection supplies a censored likelihood/interval, not a measured SNR value. Never
impute the threshold, zero, or a prediction as its ordinary-MAE label. Decoded-only
MAE can be a declared secondary conditional estimand but cannot support the
primary physical accuracy target. No eligible characterized dataset has been
established here; accuracy, power, subgroup and superiority gates remain BLOCKED.
The versioned protocol fixes the proposed weighting, split, replay and resampling
rules and names prerequisites before any held-out outcome may be examined.
The station/date/storm connected-component bootstrap is an experimental SNR
candidate pending a development-only connectivity/power study: a radio network
can collapse into one giant component. It does not provide a generally accepted
multiway estimator or a resampling protocol for other event families.

## Adopted M01–M24 specification

# Propulse propagation mathematical and execution specification — revision 1

Design date: 10 September 2026. Implements the requirements in [report #945](https://github.com/crypticpy/propulse/issues/945) and [epic #946](https://github.com/crypticpy/propulse/issues/946). This is a proposed, implementation-ready mathematical contract, subject to PROP-01 scientific and repository design review. It is not a completed solver, independent scientific approval, benchmark result, or authorization to activate/train a model. Equation identifiers below are stable implementation references.

## 1. Architecture and quantities

Build one deterministic prediction service with four layers: immutable environment/station context; physical circuit and receiver calculations; optional observation corrections and registered learned adapters; typed output heads and consumer projections. The 24-hour heatmap, band grid, path view, and collector use the same request/result records. They do not reimplement formulas or interpret generic quality scores independently.

The chosen initial physical implementation is a statically linked, browser-portable adaptation of the official ITU-R HF reference code, with a separately identified enhanced physical mode. It supplies a serious multi-mode statistical circuit baseline. Building a new three-dimensional magnetoionic ray tracer is an optional later experiment, not a prerequisite for accurate offline delivery. The application does not call or wrap VOACAP. VOACAP remains an independent comparator.

| Output head | Exact meaning | What it must not become |
| --- | --- | --- |
| Physical circuit | Mode geometry, field strength/power, losses, SNR2500, and reference reliability within its declared domain | A personal contact probability |
| Conditional decode | Probability of a declared decoder/intelligibility event, given transmission, listening, station configuration and modeled interference | Evidence that either operator is active |
| Network detection | The existing learned model's exact exposure, geographic cell, time bucket and reception event | A reciprocal station-to-station QSO |
| Observed activity | Qualified recent observations and receiver/transmitter coverage | Negative propagation evidence from an empty map |
| DX recommendation | A station-feasible action ranked using physical margin and qualified activity; later an independently calibrated attempt-outcome utility | A universal success percentage derived from a heuristic score |

**M01 — request identity.** A request contains `schemaVersion, issuedAt, validAt, targetEvent, frequencyHz, modeProfileId, tx, rx, route, stationScenarioId, contextId, requestedModelId, policyVersion`. Station records contain coordinates, coordinate precision, delivered-power assumptions, antenna patterns, feed losses and noise assumptions, with explicit unknowns. Cache key = SHA-256 of a canonical serialization including all these scientific inputs and asset/calibration versions. Coordinates and numeric values are serialized deterministically; quantization, if used for a grid, is explicit in the request and never silently applied to a precise path. `viewScopeId` owns UI preference and cancellation, separate from the scientific cache key, so identical calculations can be shared without joining independent views.

Result heads carry `quantity, units, conditioning, domain, availability, effectiveModelId, modelVersion, contextId, validAt, uncertaintyKind, calibrationId, assumptions, fallbackReason`. Availability is an enum, not a magic zero: `available`, `unsupported`, `missing_input`, `unavailable`, `experimental`. Supported but low SNR remains a valid prediction. Missing physical diagnostics cannot invalidate an independently supported learned head. A head may be absent while other heads remain available.

**M02 — as-issued time.** An observed input is eligible only when its measurement interval ended by `issuedAt`, its publication/availability time is no later than `issuedAt`, and the service had captured it by `issuedAt` for an actual historical replay. A forecast may have a future valid time, but its issue/publication/capture times must be no later than the prediction issue time. Revised products retain separate versions. Unknown publication history cannot masquerade as a verified as-issued archive.

The initial 24-hour view evaluates `validAt[j] = issuedAt + j × 3600 seconds`, for j=0…23. These are 24 explicitly labeled instantaneous samples; a cell's drill-down reuses its exact request. A network model's hourly detection bucket is a separate interval-valued head, with the actual bucket displayed. A future UI choosing hourly intervals instead must version the aggregation contract and evaluate those intervals; no instantaneous SNR is relabeled as the probability of an opening somewhere in an hour. The band grid has the same station/target/route/time inputs, or an explicit named reference-target ensemble; “global conditions” cannot equal every possible path.

## 2. Reference and enhanced offline physics

### 2.1 Reproducible physical reference

Pin the official [ITU-R-HF reference repository](https://github.com/ITU-R-Study-Group-3/ITU-R-HF/tree/cd172be56dc04b154e5d2fa91cbaa6ecf5284305), tag v14.3 at commit `cd172be56dc04b154e5d2fa91cbaa6ecf5284305` (the code's reported version must also be captured; some source reports 14.2). Preserve source notices, coefficient origins, build flags and SHA-256 hashes. PROP-06 verifies actual asset rights, binary formats and portability before packaging. The reference source dynamically loads its noise library; the portable build must replace that platform loading boundary with static linking, not attempt `dlopen` in a browser.

**M03 — normative reference algorithm.** Run the pinned `P533.c` sequence and its native parameter validation, mode support, MUF variability, screening, field strength, receiver-power and reliability routines. Reference outputs are `itu-reference-cd172be`; no equation excerpt in this document replaces a omitted term in that implementation. Golden cases compare the native executable with the portable build, including individual E/F2 modes and intermediate control points. Native parity preserves the reference's month/hour convention and coefficient interpolation. The [P.533 recommendation](https://www.itu.int/dms_pubrec/itu-r/rec/p/R-REC-P.533-14-201908-I!!PDF-E.pdf) defines the circuit method; cross-distance transitions are not an arbitrary sum of independent free-space hops.

The enhanced identity is `propulse-physics-v1`, with a separate manifest. It may use actual date/time interpolation, revised noise assumptions, observation-conditioned ionospheric state and station handling. Each enhancement is ablated against the faithful reference. Do not describe enhanced outputs as unchanged reference outputs or general standard conformance. The initial reference band domain is 2–30 MHz; 160 m below 2 MHz needs an explicitly named, separately validated extension or a disclosed legacy fallback. The service must return a truthful result for this case, not silently clamp frequency to 2 MHz.

### 2.2 Ionospheric state and solar indices

**M04 — climatology and state.** Let the reference climatology be `x0(g,t,R) = [ln foF2, ln M(3000)F2, ln foE]`, where frequencies are in MHz and g is a geographic point. The portable provider uses the actual reference monthly coefficient/grid assets and their native spatial and solar-index interpolation, not the current application's hand-shaped “CCIR-like” daily curve. In the reference interpolation's valid range, a scalar field with solar anchor values v0 and v100 has `v(R)=(1−R/100)v0+(R/100)v100`; native validation and clipping rules take precedence. Never invent extrapolation beyond the coefficient domain. Enhanced calendar/hour interpolation is separately tested for periodic continuity; interpolate positive physical parameter values before taking logs, not category labels or final probabilities. Polar cells and longitude wrapping receive dedicated fixtures. A compact coefficient representation is acceptable only after proving equivalence against the full assets over the domain.

Offline solar input is a bundled versioned monthly climatology/prediction of the appropriate smoothed index, optionally replaced by a user's explicitly chosen scenario. Do not turn today's F10.7 into a measured smoothed sunspot number with `R12=(SFI−63.7)/0.728`. Retain that relation only as a labeled legacy assumption/comparison, if needed. Daily F10.7, trailing means and smoothed sunspot series are distinct variables. An aging bundle remains usable as a climatological scenario with its reference date and growing uncertainty; no network call or model file is needed at solve time.

**M05 — heights and density.** `foF2(MHz)=8.98×10^-6 sqrt(NmF2[m^-3])` relates peak plasma density to its critical frequency. Physical peak height `hmF2`, virtual/reflection height `hr`, and M(3000)F2 are different quantities. Preserve the reference calculation of `hr` from its full parameter set. An observed hmF2 cannot simply replace hr; TEC cannot determine NmF2 or foF2 uniquely because `TEC = ∫ Ne dh`. An observed vertical profile requires an observation operator consistent with the relevant physical parameter, not a ratio applied indiscriminately to every layer.

### 2.3 Geometry and supported paths

**M06 — spherical geometry fixtures.** Use Earth radius R=6371 km for the declared spherical adapter. For transmitter/receiver unit vectors u,v, `θ=atan2(|u×v|,u·v)`, short distance Rθ, long distance R(2π−θ). For non-degenerate endpoints, short tangent `q=(v−(u·v)u)/sinθ`; long tangent is −q. A path sample is `r(s)=u cos(s/R)+q_route sin(s/R)`. Use a numerically stable orthonormal construction near degeneracy. Coincident and exactly antipodal endpoints require an explicit route azimuth or an `ambiguous_geometry` result; never invent a unique long path. A zero-distance MUF visualization is not a valid HF circuit request.

For a spherical mirror test with n equal hops, total ground distance D and mirror height h, set `a=D/(2nR)`, `l=sqrt(R²+(R+h)²−2R(R+h)cos a)`, elevation `e=atan2((R+h)cos a−R,(R+h)sin a)`, total geometric ray length `2nl`. This is a geometry fixture/diagnostic, not a replacement for the statistical reference's full mode calculation. A below-horizon elevation is not repaired with `abs` or a positive minimum. In particular, a short ground distance can have a long, nearly vertical ray.

**M07 — mode semantics.** Preserve per-mode supported geometry and screening, above-MUF loss, delay and field strength. Median MUF is not an absolute day-by-day cutoff: the reference explicitly handles variability and above-MUF loss. Distinguish `geometrically_unsupported`, `screened`, and `above_basic_muf_with_loss`. An unsupported mode contributes no power; a weak supported mode may still contribute. Reference reliability already incorporates prescribed variability; do not multiply it by another handcrafted MUF/Kp probability. Exceptional Es, auroral scatter, spread-F or trans-equatorial mechanisms need separately supported model identities and evidence; no universal “closed” claim outside the regular-mode domain.

### 2.4 Station signal and receiver noise

**M08 — signal budget.** For an individually supported path mode, a normalized diagnostic budget is `P_r,dBm = 30+10log10(P_tx,W)−L_tx+G_tx(e,az,f)−L_prop+G_rx(e',az',f)−L_rx`. Specify the reference planes: transmitter output, antenna input, available lossless receive-antenna power, receiver connector. The reference's mode `Prw` includes receive gain and is in dBW; convert to dBm by +30 and apply only losses not already included. Do not re-add antenna gain or free-space loss. Amplifier output/power caps belong in delivered power, not a second gain multiplier. A diagnostic vacuum loss, when appropriate, is `20log10(4πdf/c)` with d in meters and f in Hz. It is one component of a physical loss model, not an additional correction to the complete reference loss.

Power summation is linear: `P_sum,dBm=10log10(Σ 10^(P_i,dBm/10))`. Which modes are wanted signal versus delayed/doppler interference follows the declared receiver/mode profile and reference reliability treatment. Do not sum every delayed ray as fully usable digital signal. Per-band elevation/azimuth antenna patterns, terrain horizon and feeder loss affect the station's action feasibility; an unspecified DX antenna is a scenario range, not a known zero-dBi fact.

**M09 — noise at a single reference plane.** Use exact `kB=1.380649×10^-23 J/K`, T0=290 K. If external antenna noise factor Fa is dB above kT0, `Ta=T0×10^(Fa/10)`. For receive feeder power transmission `g=10^(−Lrx/10)`, feeder physical temperature Tp and receiver noise factor `F=10^(NF/10)`, connector-equivalent noise temperature is `Tn = g Ta + (1−g)Tp + (F−1)T0`. Thus `N_B,dBm = 10log10(kB Tn B / 10^-3)` and `SNR_B = P_connector−N_B`. Signal crosses the feeder once; its thermal contribution is also included once. Cascaded active stages use the corresponding Friis noise-factor chain with each stage's gain and reference plane.

The reference noise head keeps its native noise coefficients/statistical combination. The enhanced head uses versioned atmospheric, galactic and man-made distributions from the selected [P.372 edition](https://www.itu.int/dms_pubrec/itu-r/rec/p/R-REC-P.372-17-202408-I!!PDF-E.pdf), plus measured local noise where available. Different lognormal component medians cannot in general be added to obtain the median of their sum; combine sampled powers and then take quantiles, or preserve the reference's documented approximation. A measured total noise at the receiver connector replaces the corresponding modeled total; do not add receiver/external noise again. Persistent local RFI/QRM requires a measured spectral/interference model or an explicit unmodeled assumption.

**M10 — bandwidth and decode.** For white noise and the same captured signal power, `SNR2500 = SNR_B + 10log10(B/2500)`. Changing the receiver mode must not secretly change the reference noise bandwidth and then compare an already normalized threshold again. Non-white noise requires `N=∫ S_n(f)|H(f)|² df`. A mode profile declares reference bandwidth, threshold criterion, observation duration, decoder/version, intelligibility/error criterion and delay/Doppler tolerances. Until calibrated, return `margin_dB=SNR2500−threshold2500` and its assumptions, not a probability. Published threshold values are starting benchmarks to verify under their original test conditions, not universal decoder curves.

Once a calibrated decoder response exists, the supported head is `p_decode=E[D_m(SNR2500,delaySpread,dopplerSpread,QRM)]`. A candidate monotone profile is `D_m(s)=Φ((s−γ_m)/s_m)` with s_m>0, extended for spread/interference using measured response surfaces. Both γ_m and s_m must be fitted/verified from eligible decoder/intelligibility experiments before activation. Setting s_m arbitrarily to make the UI show percentages is prohibited.

## 3. Physics with live observations and issued forecasts

### 3.1 Source policy and correction composition

**M11 — capability and freshness.** Each provider declares actual variables, units, measurement support, quality semantics, access/license terms, observation interval, publication latency, valid horizons and outage behavior. Missing is never zero. A source-age limit is a versioned, per-variable operational bound established from cadence/latency and held-out performance. A source outside that bound is excluded from numerical corrections while its dated observation may remain visible. Offline mode explicitly excludes observation residuals; cached live mode may use still-eligible cached observations and must disclose their age. Internet connectivity alone does not establish live data eligibility.

**Correction to the original audit:** the current N5 source decision excludes IRTAM/GIRO/DIDBase on its documented access/latency grounds. This proposal does not reverse that decision. PROP-13 becomes an optional eligible-observation adapter; it can deliver a tested disabled capability when no authorized fresh source exists. GloTEC collection remains owned by #464. NOAA documents TEC and a quality flag whose semantics are not measurement variance; an actual product schema must be checked before advertising additional peak-density/height fields. No direct foF2 extraction is authorized merely because the [GloTEC system](https://www.spaceweather.gov/products/glotec) internally models a three-dimensional ionosphere. The product directory could not be inspected in this design pass (HTTP 403), so additional fields remain unverified.

Correction order is immutable and recorded: reference state → approved disturbance prior → eligible direct-state observations → circuit calculation → excess absorption → receiver/noise chain → optional eligible radio residual → calibrated output heads. Each correction declares the physical variable/mechanism it owns and covariance assumptions. Registry rejects two corrections that both claim the same total X-ray absorption, total receiver noise, or calibrated ML output. An inactive correction returns an explicit reason and identity transform. Online mode can improve with any approved subset; it does not wait for all sources or for N5.

### 3.2 Direct state observations

**M12 — residual assimilation.** Use a small, deterministic Gaussian residual update in log physical parameters, not a global foF2 multiplier. For observations of the same parameter, `z_i=ln y_i−ln y0_i`, with observation-error covariance R_obs and prior kernel K. For a prediction point *, `m*=k_* (K+R_obs)^−1 z`, `C*=K_**−k_* (K+R_obs)^−1 k_*^T`; corrected parameter = `y0* exp(m*)`. After validating the kernel and observation covariance, solve by Cholesky with a condition check, never explicit matrix inversion. This revision permits no jitter repair; singular or invalid systems disable the correction pending a separately reviewed numerical policy. If the system is singular/invalid, exclude the correction with provenance rather than returning NaN. When a storm prior exists, z is relative to that prior and C is its residual covariance, so the same departure is not applied twice.

Corrected candidate kernel is `K_ij=σx² exp(−||R u_i−R u_j||²/(2ℓ²)) exp(−|ti−tj|/τ)`, with unit Earth vectors u, R=6371 km, chordal distance in km and times in seconds. Geodesic squared-exponential covariance is prohibited; see the correction below. A separate kernel per directly observed parameter avoids assuming TEC/height/frequency equivalence. Cross-parameter covariance is enabled only with a validated observation operator. ℓ, τ, σx and quality-to-error mappings are fit on development data by regularized likelihood and selected with held-out station/time blocks; the manifest declares the selected values and fitted population. Quality counts are not directly used as inverse variance. Innovation rejection uses a preregistered standardized-residual rule, with rejected records retained for audit; synthetic outlier tests precede any fit. Unavailable eligible data means identity update and prior uncertainty, not invented observations.

### 3.3 Disturbance history and future state

**M13 — bounded disturbance prior.** Replace an instantaneous global Kp penalty with a regularized, geographically/seasonally conditioned residual model. A concrete candidate uses lag states `a_k(t+Δ)=exp(−Δ/τ_k)a_k(t)+(1−exp(−Δ/τ_k))u_t`, τ_k in {3,12,36} hours, driven by the official linear ap conversion of Kp where that is the available series. Retain Kp's original cadence and qualifier. Do not average logarithmic Kp as if it were linear ap or silently treat hourly Hp as Kp. These three time constants are design basis functions, not empirically established relaxation times.

Let φ contain these lag states, day/night solar zenith, geomagnetic-latitude and season basis functions, their preregistered interactions, and optional separately validated Dst trend. Predict `δln foF2 = β^T φ`. Fit β by weighted ridge loss on development residuals with station/storm-block validation; allow positive and negative responses. Optional fast solar forcing is `ln(F10.7_daily/F10.7_trailing81day)` with explicit trailing availability, never a future-centered mean. Parameters default to zero/disabled until the correction improves validation. Prediction leaves the calibrated feature domain → omit correction and widen/qualify uncertainty; do not extrapolate a large storm into physically impossible layer values. Bounds come from the supported validation domain and are recorded, not selected after observing test failures.

**M14 — forecast.** Future disturbance states evolve with the same recurrence, driven only by forecasts actually issued at the prediction's issue time. A three-hour Kp forecast remains piecewise three-hour input; a daily solar forecast remains daily. Forecast ensembles use horizon-specific, temporally correlated forecast errors estimated from as-issued forecast archives; carry the state covariance forward. When future drivers are absent, the residual state relaxes toward the climatological prior with the declared lag model and increasing forecast uncertainty. Recent Bz, spots or an X-ray burst are not held constant for 24 hours. Their forecast persistence, if enabled, is a separately validated horizon-limited transition, otherwise their numerical correction ends at its supported horizon. A 24-hour product is produced by the physical forecast even when the selected learned model only supports the current bucket.

### 3.4 D-region absorption

**M15 — absorption units and passes.** NOAA's [D-RAP documentation](https://swpc-drupal.woc.noaa.gov/content/global-d-region-absorption-prediction-documentation) gives a daytime highest-affected-frequency relation `H=max(0,10log10(Fx[W/m²])+65)×max(cosχ,0)^0.75` MHz and `A(f)=A(f0)(f0/f)^1.5`. Its global map is a 1 dB vertical round trip; the polar product uses a different reference level. The documented proton calculation needs energy thresholds beyond a lone ≥10 MeV channel. Preserve these distinctions and use only supported products.

For the enhanced thin D-shell approximation at height hD, an outgoing ray of ground elevation e has `sec zD = [1−(R cos e/(R+hD))²]^-1/2`. At each upward/downward crossing, one-way excess loss is `0.5 × ΔA_vertical_roundtrip(f,point,time) × sec zD`. Sum each crossing once using its own illumination/location. hD=90 km is the initial explicitly declared effective-shell approximation; validate its sensitivity before promotion. Its finite near-horizon behavior is preferable to an unbounded ground `1/sin(e)` multiplier, but it is still an approximation, not full electron-collision integration.

The quiet reference already contains ordinary absorption. Therefore choose exactly one implementation: replace its isolated absorption component with a compatible total model, or add only `ΔA=max(0,A_current−A_quiet_counterfactual)` at matched frequency/geometry/convention. The counterfactual must be an available, frozen, validated quiet-state model. Raw D-RAP total loss cannot simply be added to P.533, and an undocumented “quiet subtraction” cannot be shipped. If no compatible decomposition exists, publish the absorption product as an advisory and keep the reference numerical loss. X-ray and proton contributions may be summed only when the selected product has not already combined them. PROP-11 owns validation of this interface, not a free-standing weather score.

### 3.5 Radio observations and empirical corrections

**M16 — radio evidence.** Deduplicate by transmission identity (transmitter, time interval, frequency, mode/source rules) before grouping receptions. Preserve receiver uptime, reporter selection and archive completeness. `n_eff=(Σw)²/Σw²` is computed over independent transmission/time blocks, not raw receivers reporting the same signal. Empty cells with no qualified exposure remain unknown. N5 feature cuts, sampling/exposure denominators and historical repair ownership (#594, #465) stay intact.

A station-matched SNR residual is `e_i=SNR_observed,2500−SNR_physics,2500` only when both reference bandwidth and transmitter/receiver configuration are sufficiently known. Candidate local residual δ minimizes `Σ w_i ρ_Huber((e_i−δ−b_receiver)/σ_i)+λδ²`; receiver offsets use partial pooling with training-only estimates. Weights have separately normalized age, geographic/path similarity and measurement-quality terms, selected on validation; they are not arbitrary counts-to-confidence multipliers. Unknown power/noise/antenna is either integrated as a declared latent scenario or excludes the record from absolute SNR calibration.

Decoded reports are truncated observations: if reports require SNR>c, the observed likelihood is `p(y|θ,y>c)=p(y|θ)/(1−Fθ(c))`. With a known attempted exposure and no decode, the contribution is `Fθ(c)` under that detection model. Unknown attempts are not failures. If the selection function cannot be identified, use spots for activity and conditional ranking only; do not train an allegedly unbiased absolute residual. Avoid using a receiver to calibrate itself in the final holdout. WSPR SNR/power evidence does not establish FT8/SSB/QSO probabilities by unit conversion alone.

## 4. Uncertainty, learned models and DX decisions

### 4.1 Joint uncertainty

**M17 — explicit uncertainty sources.** Separate day-to-day propagation variation, input/state uncertainty, station/noise assumptions, future driver errors, parameter uncertainty and model discrepancy. A native reliability/decile result is kept as its native quantity; do not resample its variation and multiply the native reliability again. For enhanced predictions, sample a joint latent environment X and fitted parameters Θ and run the same circuit/receiver/mode calculations: `Var(Y)=EΘ[Var(Y|Θ)]+VarΘ[E(Y|Θ)]`. Residual variance must cover only effects not already represented in X. Quantiles follow propagation through the model, not ± a percentage around a heuristic score.

Reuse the same spatial/time environment draws across bands, reciprocal directions, routes and adjacent forecast times; independent random samples would create fake diversity and overconfident two-way estimates. A deterministic stream is keyed by the environment/context, ensemble version and sample index, not independently by each band or UI request. Start with 64 preview and 256 final draws; compare doubled ensembles and report numerical convergence separately from physical uncertainty. Adaptive limits and latency are checked by PROP-29. Uncalibrated dispersion is labeled `model_spread`; only held-out coverage qualifies a predictive interval. Missing station parameters produce explicitly named scenarios/ranges, not fabricated precise priors.

**M18 — reciprocal feasibility.** For each paired draw, compute `M_ab=SNR_ab−γ_mode,ab`, `M_ba=SNR_ba−γ_mode,ba`. The conservative score is the 10th percentile of `min(M_ab,M_ba)` on the same route/action configuration. A shared propagation channel does not imply equal SNR: power, antennas, local noise and listening setups differ. Where a calibrated joint decoder model exists, estimate both-direction success from the joint draws and conditional decoder model. With only marginal probabilities and unknown dependence, publish bounds `max(0,p_ab+p_ba−1) ≤ p_both ≤ min(p_ab,p_ba)`; do not assume independence. A single-direction result remains single-direction when the other station is unknown.

### 4.2 Selection, model eligibility and optional fusion

**M19 — capability-based routing.** Registry entries declare exact output event, domain, horizons, model/feature/preprocessing hashes, required/optional inputs, internal fallback and calibration. For each requested head: select the user's eligible named model, else eligible observation-assisted physics, else bundled physics for physical heads. For Auto, use a versioned recommended model per event/domain determined by validation, not whichever returns the largest score. An unavailable network-probability head cannot be replaced by a physically meaningless “same” percentage; the UI falls back to a physically supported guidance head with its different label. Requested model preference persists independently from the effective head.

Current NowCast and successor N5 are separate adapters. Preserve N5's exact frozen physical-feature engine hash; never place this new core under an already trained feature contract. An independent N5 no-physics fallback can remain valid if physical diagnostics fail. The future successor can replace a registered role after its own #463–#468 gates; the service does not change training science or activation files. A model that predicts current network detection cannot supply untrained 24-hour probabilities or personal QSO results.

**M20 — optional same-event fusion.** Do not average physical reliability, spot counts and ML percentages. If two qualified models predict the same event under the same exposure/horizon, a distinct ensemble candidate may use `logit p = β0+βp logit p_physical_event+βm logit p_ml`, with probabilities bounded away from 0/1 by a recorded numerical epsilon. Fit coefficients and final calibration on out-of-fold predictions, using blocked station/time splits, then score on untouched independent data. A physical-to-network event mapping itself needs a valid exposure/label calibration. Freeze all component versions. Default is no fusion; the registered ensemble is selectable only after better held-out calibration/skill, and Auto eligibility needs the same release controls as any other model. This proposal does not authorize training it now.

### 4.3 Recommendations

**M21 — initial action ranking.** Enumerate feasible `(target, band, mode, route, validAt, station configuration)` actions after equipment/legal/user constraints. Rank first by supported station/circuit domain, then conservative reciprocal margin where available, then qualified target activity and its age, then user preference/operating cost. Preserve explanations and tie-breaks; unknown reciprocity has a distinct one-way rank class. Compare margins only against the selected mode's declared criterion; label uncalibrated criteria. Do not let an active spot override an unsupported circuit or use a missing spot as proof of a closed band. Proposed opening windows are contiguous qualifying forecast samples with time resolution disclosed, not a promise of continuous support between samples.

**M22 — eventual contact utility.** A personal contact needs activity/listening, two-way link success and operator response/completion. The correct chain is `P(QSO|attempt,x)=P(A|attempt,x) P(L|A,attempt,x) P(C|L,A,attempt,x)` for explicitly defined successive events. These are conditional factors, not independent probabilities. Until attempted/failed/unknown outcomes and selection are measured, return no numeric QSO probability. A later calibrated action utility can be `U(a)=value(a)P(QSO|attempt,a,x)−λ E[minutes|a,x]`, with the user's objective/weights explicit. Estimate prospective recommendation benefit using randomized eligible-policy assignment or a preregistered operator/session crossover, not success-only spot archives.

## 5. Verification and evidence gates

**M23 — preregistered measurement contract.** PROP-01 freezes dataset licenses/access, station/storm/time separation, event definitions, metrics and population before fitting or evaluating. Candidate defaults below are concrete design targets, not existing evidence and not permission to weaken existing N5 gates. If data or hardware makes a target infeasible, return to design review before seeing held-out outcomes; do not move the threshold after failure.

| Gate | Proposed executable pass rule |
| --- | --- |
| Portable reference | 1,000 manifest-selected circuits plus analytic fixtures; native/portable mode support and enums identical; absolute error ≤0.01 dB for power/SNR/loss, ≤0.001 MHz MUF, ≤0.01° elevation; no NaN or sentinel displayed as a real value. Cases include 7,000/9,000 km boundaries, poles, terminator, date line and near-degenerate geometry. |
| Shared surfaces | Identical canonical request/context produces the same numerical record for single/batch, worker/server, grid/drill-down; display rounding may differ, scientific record may not. |
| Physical primary accuracy | Primary: weighted SNR2500 MAE in dB on an independently exposed, station-characterized dataset with independently measured SNR for every included exposure, with fixed weighting. Censored failed detections are not ordinary SNR observations; a separate censored estimand requires a new protocol. Target ≥20% relative MAE reduction vs audited legacy physics; paired storm/day/station block bootstrap 95% interval for improvement excludes zero. If no identifiable eligible SNR dataset exists, this gate is blocked; do not substitute decoded-only MAE unnoticed. |
| External comparison | Use pinned VOACAP and the faithful ITU reference as separate comparators under matched station/time/available-input scenarios. State comparator domain and input advantage. Any claimed superiority needs positive paired skill with 95% interval excluding zero; report all preregistered material slices. |
| Direct state checks | Report foF2/height/MUF errors only where the measured quantity matches the model quantity; exclude assimilation stations/times from validation as specified. Geographic absence is a limitation, not extrapolated validation. |
| Predictive intervals | On each sufficiently supported declared release population, 80% interval empirical coverage in [0.75,0.85] and 95% interval coverage in [0.92,0.98], with block-resampled uncertainty reported; assess sharpness/interval score against baseline to reject trivial wide intervals. At least 30 independent temporal/storm blocks, 20 held-out stations and 500 eligible cases overall are floor diagnostics, not a substitute for a precision/power calculation. |
| Probability | Brier score and log loss on known eligible exposures, reliability diagrams, prevalence and sample selection. Positive paired Brier skill vs climatology and the applicable baseline with 95% block interval above zero; no probability label without its event and calibration population. |
| Regression | For preregistered adequately powered band/mode/day-night/latitude/storm/horizon slices, reject >10% MAE degradation supported by a 95% paired interval; insufficient slices remain excluded/qualified, not declared passed. Correct multiplicity for confirmatory slice claims. |
| Optional correction | Offline→disturbance→direct observations→absorption→radio ablations; each numerical addition needs a validated population/horizon, non-overlapping mechanism and demonstrated benefit. Unhelpful contributions remain advisories or disabled. More feeds is not a gate by itself. |
| DX outcome | Primary completed contacts per deliberately attempted recommendation, unknown outcomes retained and sensitivity bounded; operator/session clustered 95% effect interval above zero before uplift claim. Analyze assignment and adherence separately. Report time-to-contact with censoring and contacts/hour as secondary outcomes. |
| Runtime | Proposed target devices: iPhone 12 Safari, Pixel 6 Chrome, and a four-core 8 GB laptop browser; record exact OS/browser versions. Warm deterministic 24×11 existing-catalog path grid (including separately unqualified 160 m and 6 m slots) p95 ≤500 ms; first usable offline physical result ≤2 s after installed assets are loaded; app-added resident worker memory ≤128 MiB; no >50 ms main-thread task from the solver. Ensemble refinement p95 ≤3 s or explicitly progressive. Asset/compression/installation size must be measured in PROP-06 before accepting this budget; no claim that raw reference maps already fit. |

For a two-arm independent binomial planning example with baseline p0=0.30, target p1=0.35, two-sided α=0.05 and power=0.80, use `n≈[z_(1−α/2)√(2pbar(1−pbar))+z_power√(p0(1−p0)+p1(1−p1))]²/(p1−p0)²` per arm. Inflate for operator/session correlation, missingness and multiplicity using the preregistered design. This is a sample-planning illustration, not an assertion that those rates or independent attempts describe Propulse users.

**M24 — release and drift.** Archive exact inputs, context/asset/model hashes, effective heads, unavailable cases and issued predictions before observations arrive. Collector replay must call the same predictor, not a sibling heuristic. Core physical archive/evaluation does not depend on N5 logging delivery; N5's exact exposure and promotion contracts remain mandatory when N5 participates. Monitor source latency/coverage, input/domain drift, calibration, station slices, fallback frequency and issued-versus-realized error separately. Use reversible registry versions and the existing owner-controlled activation mechanism. Missing outcomes produce “insufficient,” not a pass. Scientific parity, usable beta delivery and an advertised DX superiority claim are distinct milestones; prospective data collection can precede a superiority claim without a circular prerequisite.

## 6. Parameters and implementation boundaries

| Parameter family | Origin/default | Activation rule |
| --- | --- | --- |
| c, kB, reference temperatures; km/MHz adapters | Declared constants and unit conventions | Analytic fixtures |
| Ionosphere/noise/reference coefficients | Pinned reference manifest and selected edition | Rights/source/hash + native parity |
| Monthly solar scenario | Bundled dated series or explicit user scenario | Display provenance/age; never daily-as-smoothed substitution |
| hr and mode transitions | Full reference routines | Preserve reference/enhanced distinction |
| Station powers/gains/losses/noise | User equipment + declared default scenarios | Unknowns remain visible and uncertainty-qualified |
| Decoder γ, slope, spread response | Published-condition benchmark then controlled measurement | Margin only until independently calibrated |
| GP scales/error covariance | Development fit; no production invented numbers | Station/time held-out benefit and interval coverage |
| Storm β / optional solar response | Zero/disabled initially; lag basis specified in M13 | Storm-block validation, as-issued features and domain checks |
| hD and quiet absorption counterfactual | Declared 90 km candidate + validated mechanism isolation | Excess/replacement accounting fixtures and held-out absorption validation |
| Spot residual weights/receiver effects | Development fit with selection model | Eligible exposure/configuration or activity-only output |
| Ensemble priors/calibrators | Frozen versioned development fits | Coverage and numerical-convergence evidence |
| Model recommendation/fusion/contact utility | Explicit approved policy; fusion/QSO probability off initially | Same-event comparison, prospective outcome gates and owner promotion |

Suggested modules are `contracts`, `context`, `ionosphere`, `reference`, `circuit`, `noise`, `station`, `corrections`, `uncertainty`, `models`, `predictor`, `guidance`, and `replay`. Keep the pure solver without fetch, clock reads, mutable stores or React imports. Load validated assets/context before calling it. Expose `predict(request, context, assets)` and `predictBatch(requests, context, assets)` with cancellation at batch boundaries. A compiled control-point provider boundary supplies the state to all reference calculations; pre-populating a struct that `InitializePath` immediately overwrites is not an implementation. Keep raw reference output and normalized enhanced output separately testable.

Failure handling is per head/source: reject invalid coordinates/units and inconsistent receiver planes; quarantine an invalid correction; retain eligible physical or learned outputs; attach a precise reason. Cache lifetime depends on context identity and source validity, not only wall-clock TTL. Reconnection creates a new context/version and recomputes visible requests; late completion of an old context cannot replace newer results. Offline installations atomically retain a complete known-good asset manifest before deleting an older one.

## 7. Execution mapping and self-review

| Equations / obligation | Owner leaf |
| --- | --- |
| M01–02, M11 source/time contracts | PROP-04/05; PROP-01 ratifies source ledger |
| M03 reference/portable build and domain | PROP-06/08 |
| M04–05 ionosphere/index/height semantics | PROP-07 |
| M06–07 geometry, modes and support | PROP-02/03/08 |
| M08–10 station, noise, normalized margins | PROP-02/09/10 |
| M12 optional direct observations | PROP-13 |
| M13–14 disturbance/forecast state | PROP-12 with PROP-05 |
| M15 absorption | PROP-11 |
| M16 radio evidence | PROP-14 |
| M17–18 uncertainty and decoder-head contract | New PROP-29; station/guidance consume it |
| M19 selection/current/successor compatibility | PROP-15/16/19 |
| M20 optional same-event ensemble | New PROP-31; not a core prerequisite |
| M21–22 guidance/outcomes | PROP-24/25/26 |
| M23 scientific protocol/calibration | PROP-01/23/29 |
| M24 logging/release/rollback | PROP-22/27/28; new PROP-32 for successor-specific end-to-end qualification |
| Optional live correction composition | New PROP-30, after baseline service and each optional module; individual omissions allowed |

The plan review identified and repairs: core composition/logging/evaluation blocked on optional ionosonde/N5 work; an eligible-source assumption inconsistent with the N5 source decision; missing dedicated joint uncertainty ownership; hmF2 versus reflection-height conflation; reference portability/load assumptions; duplicate absorption/noise/ML corrections; missing distinction between model availability and event compatibility; and a prospective-evidence-versus-release circularity. The original audit remains historical evidence; this candidate proposes these design decisions, subject to the status and correction rules above.

Foundations can be assigned once the owner releases the lane: PROP-01 and the independent reproduced-defect leaf PROP-02; then PROP-03 after PROP-02, and the contract/reference branches after PROP-01. Other leaves follow native dependencies. Core delivery must not depend on an untrained successor, unavailable direct-state observations, or a future ensemble. Optional branches can qualify and join later. PROP-01 still owns a real independent scientific review and the required Fable review before downstream build; this document's author self-review does not satisfy either. All implementation, production validation and measured accuracy gains remain work to do.

The mathematical companion supplies numerical examples and invariants for this design only. It does not execute the full reference solver or establish on-air accuracy. Agents must adopt the reviewed specification into the repository's plan-of-record path and add the actual native/portable and observational evidence required above.
