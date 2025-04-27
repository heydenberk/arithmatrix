#!/usr/bin/env python3

import math

print("=== KENKEN DIFFICULTY FORMULA ANALYSIS (IMPROVED) ===\n")

# Our observed data
data = {
    4: {"median": 110, "mean": 120, "min": 103, "max": 207},
    5: {"median": 3932, "mean": 4542, "min": 400, "max": 14663},
    6: {"median": 716, "mean": 3968, "min": 338, "max": 52522},
    7: {"median": 367583, "mean": 2361100, "min": 2368, "max": 28861848},
}

sizes = [4, 5, 6, 7]
medians = [data[s]["median"] for s in sizes]

print("=== DATA ANALYSIS ===")
print("Raw data points:")
for i, s in enumerate(sizes):
    print(f"  {s}x{s}: {medians[i]:,} operations (median)")

print(f"\n=== OUTLIER DETECTION ===")
print("The 6x6 median (716) appears to be an outlier - much lower than expected.")
print("This suggests high randomness in cage generation affects results significantly.")

# Analysis excluding 6x6 outlier
print(f"\n=== ANALYSIS EXCLUDING 6x6 OUTLIER ===")
sizes_clean = [4, 5, 7]
medians_clean = [110, 3932, 367583]


def fit_exponential_clean(x_vals, y_vals):
    """Fit exponential model using log transformation"""
    log_y = [math.log(y) for y in y_vals]
    n = len(x_vals)

    x_mean = sum(x_vals) / n
    log_y_mean = sum(log_y) / n

    numerator = sum((x_vals[i] - x_mean) * (log_y[i] - log_y_mean) for i in range(n))
    denominator = sum((x_vals[i] - x_mean) ** 2 for i in range(n))

    if denominator == 0:
        return None, None

    log_b = numerator / denominator
    log_a = log_y_mean - log_b * x_mean

    a = math.exp(log_a)
    b = math.exp(log_b)

    return a, b


a, b = fit_exponential_clean(sizes_clean, medians_clean)
print(f"Exponential fit (excluding 6x6): Operations = {a:.2f} × {b:.3f}^n")

# Predictions with clean model
print("\nPredictions with clean model:")
for s in [4, 5, 6, 7, 8, 9]:
    pred = a * (b**s)
    if s in [4, 5, 7]:
        actual = medians[sizes.index(s)] if s != 6 else "N/A"
        if actual != "N/A":
            error = abs(pred - actual) / actual * 100
            print(f"  {s}x{s}: {pred:,.0f} (actual: {actual:,}, error: {error:.1f}%)")
        else:
            print(f"  {s}x{s}: {pred:,.0f}")
    elif s == 6:
        actual = 716
        error = abs(pred - actual) / actual * 100
        print(
            f"  {s}x{s}: {pred:,.0f} (actual outlier: {actual:,}, diff: {error:.0f}%)"
        )
    else:
        print(f"  {s}x{s}: {pred:,.0f} (prediction)")

print(f"\n=== ALTERNATIVE APPROACH: GEOMETRIC MEAN PROGRESSION ===")
# Calculate growth factors
growth_4_to_5 = medians[1] / medians[0]  # 3932 / 110
growth_5_to_7 = (medians[3] / medians[1]) ** (1 / 2)  # sqrt(367583 / 3932) - skip 6

print(f"Growth factor 4→5: {growth_4_to_5:.1f}x")
print(f"Average growth factor 5→7: {growth_5_to_7:.1f}x per size step")

# Use average growth factor
avg_growth = (growth_4_to_5 + growth_5_to_7) / 2
print(f"Average growth factor: {avg_growth:.1f}x per size increase")

print(f"\nProgression using average growth factor:")
pred_4 = 110  # base case
print(f"  4x4: {pred_4:,.0f} (actual: {medians[0]:,})")

pred_5 = pred_4 * avg_growth
print(f"  5x5: {pred_5:,.0f} (actual: {medians[1]:,})")

pred_6 = pred_5 * avg_growth
print(f"  6x6: {pred_6:,.0f} (actual outlier: {medians[2]:,})")

pred_7 = pred_6 * avg_growth
print(f"  7x7: {pred_7:,.0f} (actual: {medians[3]:,})")

pred_8 = pred_7 * avg_growth
pred_9 = pred_8 * avg_growth
print(f"  8x8: {pred_8:,.0f} (prediction)")
print(f"  9x9: {pred_9:,.0f} (prediction)")

print(f"\n=== THEORETICAL BOUNDS ===")
print("Based on computational complexity theory:")
print("KenKen solving is NP-complete, so we expect exponential growth.")
print("\nLower bound: Latin square constraints alone → O(n!)")
print("Upper bound: Full constraint satisfaction → O(n^(n²))")

# Calculate factorial growth for comparison
print(f"\nFactorial growth O(n!):")
for s in [4, 5, 6, 7, 8]:
    factorial_ops = math.factorial(s) * 100  # scaled
    print(f"  {s}x{s}: {factorial_ops:,} operations (if O(n!) × 100)")

print(f"\n=== PRACTICAL FORMULAS ===")
print("Based on our analysis, here are three approaches:\n")

print("1. EXPONENTIAL MODEL (excluding outlier):")
print(f"   Operations ≈ {a:.0f} × {b:.1f}^n")
print(f"   Good for sizes 4,5,7+ but misses 6x6 variability\n")

print("2. GEOMETRIC PROGRESSION:")
print(f"   Operations ≈ 110 × {avg_growth:.0f}^(n-4)")
print(
    f"   Simple rule: each size increase multiplies difficulty by ~{avg_growth:.0f}\n"
)

print("3. EMPIRICAL LOOKUP with INTERPOLATION:")
print("   Use actual measured values with exponential interpolation")
print("   Most accurate for practical use\n")

print("=== CONFIDENCE INTERVALS ===")
print("Given the high variance observed:")

confidence_multipliers = {4: 2, 5: 4, 6: 20, 7: 10, 8: 15, 9: 20}

for s in [4, 5, 6, 7, 8, 9]:
    if s <= 7:
        base = medians[sizes.index(s)] if s != 6 else pred_6
    else:
        base = a * (b**s)

    multiplier = confidence_multipliers[s]
    lower = base / multiplier
    upper = base * multiplier

    print(f"  {s}x{s}: {lower:,.0f} - {upper:,.0f} operations (median ≈ {base:,.0f})")

print(f"\n=== KEY INSIGHTS FOR FORMULA DERIVATION ===")
print("1. Pure exponential fits poorly due to 6x6 outlier")
print("2. Generation randomness creates enormous variance")
print("3. Growth factor is roughly 35-93x per size increase")
print("4. 7x7 puzzles are qualitatively different (all >2K operations)")
print("5. Practical formula should include confidence bounds")

print(f"\n=== RECOMMENDED APPROACH ===")
print("For software implementation:")
print("• Use empirical lookup table for sizes 4-7")
print("• Use exponential extrapolation for sizes 8+")
print("• Include variance estimates for timeout settings")
print("• Expect 10-100x variation within same size")

time_estimates = {
    4: "< 1ms",
    5: "~4ms",
    6: "1ms-50ms",
    7: "0.4s-30s",
    8: "10s-30min",
    9: "1hr-2days",
}

print(f"\nEstimated solving times:")
for s, time_est in time_estimates.items():
    print(f"  {s}x{s}: {time_est}")
