import pytest

from agriquill.pid import Pid


def test_proportional_only_follows_the_error():
    pid = Pid(kp=0.5, ki=0.0, kd=0.0, out_min=0.0, out_max=100.0)
    assert pid.step(setpoint=50.0, measurement=30.0, dt=1.0) == pytest.approx(10.0)
    assert pid.step(setpoint=50.0, measurement=50.0, dt=1.0) == 0.0


def test_integral_removes_a_steady_loss():
    pid = Pid(kp=0.5, ki=0.05, kd=0.0, out_min=0.0, out_max=100.0)
    level, loss = 30.0, 6.0
    for _ in range(120):
        level += pid.step(setpoint=50.0, measurement=level, dt=1.0) - loss
    assert abs(level - 50.0) < 1.0


def test_output_is_clamped_to_the_limits():
    pid = Pid(kp=5.0, ki=1.0, kd=0.0, out_min=0.0, out_max=40.0)
    assert pid.step(setpoint=100.0, measurement=0.0, dt=1.0) == 40.0
    assert pid.step(setpoint=0.0, measurement=100.0, dt=1.0) == 0.0


def test_the_integral_does_not_wind_up_while_saturated():
    pid = Pid(kp=0.5, ki=0.2, kd=0.0, out_min=0.0, out_max=10.0)
    for _ in range(200):
        pid.step(setpoint=100.0, measurement=0.0, dt=1.0)
    assert pid.integral <= 10.0 / 0.2 + 1e-9
    recovery = [pid.step(setpoint=100.0, measurement=95.0, dt=1.0) for _ in range(3)]
    assert recovery[0] < 10.0


def test_derivative_acts_on_the_measurement_not_the_setpoint():
    pid = Pid(kp=0.0, ki=0.0, kd=2.0, out_min=-100.0, out_max=100.0)
    pid.step(setpoint=10.0, measurement=20.0, dt=1.0)
    assert pid.step(setpoint=80.0, measurement=20.0, dt=1.0) == pytest.approx(0.0)
    assert pid.step(setpoint=80.0, measurement=25.0, dt=1.0) == pytest.approx(-10.0)


def test_reset_clears_the_memory():
    pid = Pid(kp=0.5, ki=0.1, kd=0.0, out_min=0.0, out_max=100.0)
    for _ in range(5):
        pid.step(setpoint=50.0, measurement=10.0, dt=1.0)
    pid.reset()
    assert pid.integral == 0.0
    assert pid.step(setpoint=50.0, measurement=50.0, dt=1.0) == 0.0


def test_bad_settings_are_refused():
    with pytest.raises(ValueError, match="out_min"):
        Pid(kp=1.0, ki=0.0, kd=0.0, out_min=5.0, out_max=1.0)
    with pytest.raises(ValueError, match="negative"):
        Pid(kp=-1.0, ki=0.0, kd=0.0, out_min=0.0, out_max=1.0)
    with pytest.raises(ValueError, match="dt"):
        Pid(kp=1.0, ki=0.0, kd=0.0, out_min=0.0, out_max=1.0).step(
            setpoint=1.0, measurement=0.0, dt=0.0
        )
