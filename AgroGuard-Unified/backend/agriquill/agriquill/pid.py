from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Pid:
    """Discrete PID with conditional-integration anti-windup and derivative on the measurement.

    Standard parallel form: u = kp e + ki sum(e dt) + kd (-d measurement / dt). The integral stops
    growing while the output is saturated and the error would push it further, and the derivative
    ignores setpoint changes, so a new target does not kick the output.
    """

    kp: float
    ki: float
    kd: float
    out_min: float
    out_max: float
    integral: float = field(default=0.0, init=False)
    _last: float | None = field(default=None, init=False, repr=False)

    def __post_init__(self) -> None:
        if min(self.kp, self.ki, self.kd) < 0:
            raise ValueError("PID gains must not be negative")
        if self.out_min > self.out_max:
            raise ValueError("out_min must not exceed out_max")

    def reset(self) -> None:
        self.integral = 0.0
        self._last = None

    def step(self, setpoint: float, measurement: float, dt: float) -> float:
        if dt <= 0:
            raise ValueError("dt must be positive")
        error = setpoint - measurement
        derivative = 0.0 if self._last is None else -(measurement - self._last) / dt
        self._last = measurement
        proportional = self.kp * error
        tentative = self.integral + error * dt
        raw = proportional + self.ki * tentative + self.kd * derivative
        pushing_out = (raw > self.out_max and error > 0) or (raw < self.out_min and error < 0)
        if not pushing_out:
            self.integral = tentative
            raw = proportional + self.ki * self.integral + self.kd * derivative
        return min(self.out_max, max(self.out_min, raw))
