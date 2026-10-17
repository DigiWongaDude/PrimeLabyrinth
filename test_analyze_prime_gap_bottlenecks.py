import unittest

from analyze_prime_gap_bottlenecks import pearson, threshold_score


class PrimeGapAnalysisTests(unittest.TestCase):
    def test_pearson_inverse_relationship(self):
        self.assertAlmostEqual(pearson([1, 2, 3], [3, 2, 1]), -1.0)

    def test_threshold_score(self):
        rows = [
            {"gap": 2, "survival_rate": 0.9},
            {"gap": 20, "survival_rate": 0.1},
            {"gap": 22, "survival_rate": 0.3},
        ]
        score = threshold_score(rows, 20, 0.2)
        self.assertEqual(score["true_positive"], 1)
        self.assertEqual(score["false_positive"], 1)
        self.assertEqual(score["false_negative"], 0)


if __name__ == "__main__":
    unittest.main()
