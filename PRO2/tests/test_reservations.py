# Jednotkové testy pro endpointy rezervací.
#
# Kredity se u rezervací nepoužívají – odečítají se pouze při nákupu permanentky.
# Testy ověřují: stavový automat, kapacitu lekce a autorizaci (IDOR).


def test_create_reservation_returns_confirmed(client, clen_s_kredity, auth_headers):
    """Nově vytvořená rezervace musí mít stav CONFIRMED."""
    odpoved = client.post(
        "/reservations/",
        json={
            "member_id": clen_s_kredity,
            "lesson_schedule_id": 1,
            "note": "Testovaci rezervace",
        },
        headers=auth_headers,
    )
    assert odpoved.status_code == 201
    data = odpoved.json()
    assert data["status"] == "CONFIRMED"
    assert data["member_id"] == clen_s_kredity
    assert data["credit_balance"] is None


def test_create_reservation_full_lesson_rejected(client, clen_s_kredity, auth_headers):
    """Pokus o rezervaci plné lekce musí vrátit HTTP 422."""
    from models.lesson import LessonSchedule
    from tests.conftest import TestingSessionLocal

    # Nastavíme kapacitu lekce na 1 a přidáme existující rezervaci
    db = TestingSessionLocal()
    lekce = db.get(LessonSchedule, 1)
    lekce.maximum_capacity = 1
    db.commit()
    db.close()

    # První rezervace projde
    client.post(
        "/reservations/",
        json={"member_id": clen_s_kredity, "lesson_schedule_id": 1},
        headers=auth_headers,
    )

    # Druhý člen se pokusí rezervovat stejnou plnou lekci
    from models.member import Member
    db = TestingSessionLocal()
    druhy = Member(name="Druhy", surname="Clen", credit_balance=500)
    db.add(druhy)
    db.commit()
    druhy_id = druhy.member_id
    db.close()

    from auth.jwt import vytvor_token
    druhy_headers = {"Authorization": f"Bearer {vytvor_token(member_id=druhy_id, role='member')}"}

    odpoved = client.post(
        "/reservations/",
        json={"member_id": druhy_id, "lesson_schedule_id": 1},
        headers=druhy_headers,
    )
    assert odpoved.status_code == 422


def test_cancel_confirmed_reservation(client, clen_s_kredity, auth_headers):
    """Zrušení potvrzené rezervace (CONFIRMED → CANCELLED) musí uspět."""
    rezervace = client.post(
        "/reservations/",
        json={"member_id": clen_s_kredity, "lesson_schedule_id": 1},
        headers=auth_headers,
    ).json()
    rezervace_id = rezervace["reservation_id"]

    odpoved = client.patch(
        f"/reservations/{rezervace_id}/status",
        json={"status": "CANCELLED"},
        headers=auth_headers,
    )
    assert odpoved.status_code == 200
    data = odpoved.json()
    assert data["status"] == "CANCELLED"
    assert data["credit_balance"] is None


def test_invalid_status_transition_raises_422(client, clen_s_kredity, auth_headers):
    """Neplatný přechod stavového automatu (CONFIRMED → CREATED) musí vrátit 422."""
    rezervace = client.post(
        "/reservations/",
        json={"member_id": clen_s_kredity, "lesson_schedule_id": 1},
        headers=auth_headers,
    ).json()
    rezervace_id = rezervace["reservation_id"]

    odpoved = client.patch(
        f"/reservations/{rezervace_id}/status",
        json={"status": "CREATED"},
        headers=auth_headers,
    )
    assert odpoved.status_code == 422


def test_idor_reservation_forbidden(client, clen_s_kredity, auth_headers_bez_kreditů):
    """Člen nesmí měnit stav rezervace jiného člena – musí vrátit 403."""
    from auth.jwt import vytvor_token

    token_vlastnika = f"Bearer {vytvor_token(member_id=clen_s_kredity, role='member')}"
    rezervace = client.post(
        "/reservations/",
        json={"member_id": clen_s_kredity, "lesson_schedule_id": 1},
        headers={"Authorization": token_vlastnika},
    ).json()
    rezervace_id = rezervace["reservation_id"]

    odpoved = client.patch(
        f"/reservations/{rezervace_id}/status",
        json={"status": "CANCELLED"},
        headers=auth_headers_bez_kreditů,
    )
    assert odpoved.status_code == 403
