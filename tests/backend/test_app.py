import pytest

flask = pytest.importorskip("flask")

from backend import app as app_module
from tests.backend.fixtures import all_singles_4x4


@pytest.fixture
def client(monkeypatch):
    p = all_singles_4x4()
    record = {
        "puzzle": {"size": 4, "cages": p["cages"], "solution": p["solution"], "difficulty_operations": 10.0},
        "metadata": {"size": 4, "actual_difficulty": "easiest", "operations_tier": "all", "difficulty_score": 10.0},
    }
    monkeypatch.setattr(app_module, "ALL_PUZZLES", [record])
    app_module.app.config["TESTING"] = True
    return app_module.app.test_client()


def test_serves_a_corpus_puzzle_when_one_matches(client):
    res = client.get("/api/puzzle?size=4&difficulty=easiest")
    assert res.status_code == 200, res.get_json()
    body = res.get_json()
    assert body["size"] == 4 and len(body["cages"]) == 16


def test_rejects_unsupported_sizes_and_tiers(client):
    assert client.get("/api/puzzle?size=8&difficulty=easiest").status_code == 400
    assert client.get("/api/puzzle?size=3&difficulty=easiest").status_code == 400
    assert client.get("/api/puzzle?size=4&difficulty=easiest&tier=nope").status_code == 400


def test_generates_when_the_corpus_has_no_match(client):
    res = client.get("/api/puzzle?size=4&difficulty=medium&tier=add")
    assert res.status_code in (200, 503)
    if res.status_code == 200:
        body = res.get_json()
        assert body["size"] == 4 and {c["operation"] for c in body["cages"]} <= {"", "+"}
        assert body["techniques_used"]
