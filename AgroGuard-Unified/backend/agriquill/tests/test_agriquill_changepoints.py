import numpy as np

from agriquill import fusion


def test_a_3_cm_step_in_the_residuals_is_found_where_it_happens():
    rng = np.random.default_rng(3)
    x = list(rng.normal(0, 0.5, 40)) + list(rng.normal(3, 0.5, 40))
    events = fusion.changepoints(x)
    assert any(40 <= e <= 41 for e in events)
    assert len(events) <= 2


def test_two_months_of_plain_noise_raise_at_most_one_event_a_month():
    for seed in range(5):
        noise = list(np.random.default_rng(seed).normal(0, 0.5, 120))
        assert len(fusion.changepoints(noise)) <= 2


def test_a_drift_smaller_than_the_2_cm_rule_is_still_caught():
    rng = np.random.default_rng(11)
    x = list(rng.normal(0, 0.3, 30)) + list(rng.normal(1.5, 0.3, 30))
    assert any(29 <= e <= 32 for e in fusion.changepoints(x))


def test_too_short_a_series_raises_nothing():
    assert fusion.changepoints([0.1, 5.0]) == []
