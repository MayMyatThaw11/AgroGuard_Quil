import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services import rtfp  # noqa: E402

MARKETS = int(sys.argv[1]) if len(sys.argv) > 1 else 25
HELD_OUT_MONTHS = 24
DROP_LINE = -10.0


def main() -> None:
    signals = hits = declines = months = 0
    for market in rtfp.markets()[:MARKETS]:
        rows = rtfp.market_rows(market["mkt_name"])
        for commodity in sorted(set(rtfp.COMMODITY.values())):
            series = rtfp.parse(rows, commodity)[-(HELD_OUT_MONTHS + 4):]
            for i in range(3, len(series) - 1):
                now, then, nxt = series[i]["close_mmk"], series[i - 3]["close_mmk"], series[i + 1]["close_mmk"]
                fell_next = nxt < now
                months += 1
                declines += fell_next
                if (now - then) / then * 100.0 < DROP_LINE:
                    signals += 1
                    hits += fell_next
    base = declines / months if months else 0.0
    precision = hits / signals if signals else 0.0
    print(f"markets={MARKETS} months={months} signals={signals}")
    print(f"base rate of next-month decline: {base:.1%}")
    print(f"precision of '3-month change below {DROP_LINE:.0f}%' predicting a decline: {precision:.1%}")
    earned = signals > 0 and precision >= base + 0.10
    print("prediction wording allowed" if earned else "describe only: the signal does not beat the base rate by 10 points")


if __name__ == "__main__":
    main()
