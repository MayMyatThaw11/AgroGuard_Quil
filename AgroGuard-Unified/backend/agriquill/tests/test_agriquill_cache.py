import threading
from concurrent.futures import ThreadPoolExecutor

import pytest

from agriquill import cache


def test_concurrent_misses_share_one_fetch_and_are_counted():
    cache.reset_stats()
    store: dict[str, int] = {}
    calls = []
    gate = threading.Event()

    def fetch() -> int:
        calls.append(1)
        gate.wait(5)
        store["k"] = 42
        return 42

    with ThreadPoolExecutor(8) as pool:
        futures = [
            pool.submit(cache.through, "t", "k", lambda: store.get("k"), fetch) for _ in range(8)
        ]
        while not calls:
            pass
        gate.set()
        assert {f.result() for f in futures} == {42}
    assert len(calls) == 1
    assert cache.through("t", "k", lambda: store.get("k"), fetch) == 42
    counts = cache.stats()["t"]
    assert counts["miss"] == 1 and counts["hit"] >= 1
    assert counts["miss"] + counts["hit"] + counts["coalesced"] == 9


def test_a_failed_fetch_is_not_stored_and_the_next_call_retries():
    def boom() -> int:
        raise RuntimeError("down")

    with pytest.raises(RuntimeError):
        cache.through("t2", "k", lambda: None, boom)
    assert cache.through("t2", "k", lambda: None, lambda: 7) == 7


def test_ttl_cache_skips_empty_values():
    c = cache.TTLCache("t3")
    c.set("a", {}, 60)
    c.set("b", {"x": 1}, 60)
    assert c.get("a") is None and c.get("b") == {"x": 1}
