"""The 27 current EU Member States. Deliberately excludes the UK,
Switzerland and Norway -- none are EU members, and a criteria row or
destination selector that let one through would silently misapply EU law
to a non-EU jurisdiction. Source: https://european-union.europa.eu/
principles-countries-history/eu-countries_en (27 members as of this
session; recheck before relying on this list after any future accession).
"""

from app.schemas.eu_export_quality import EUMemberStateEntry

EU_MEMBER_STATES: list[EUMemberStateEntry] = [
    EUMemberStateEntry(code="AT", name_en="Austria", name_mm="သြစတြီးယား"),
    EUMemberStateEntry(code="BE", name_en="Belgium", name_mm="ဘယ်လ်ဂျီယမ်"),
    EUMemberStateEntry(code="BG", name_en="Bulgaria", name_mm="ဘူလ်ဂေးရီးယား"),
    EUMemberStateEntry(code="HR", name_en="Croatia", name_mm="ခရိုအေးရှား"),
    EUMemberStateEntry(code="CY", name_en="Cyprus", name_mm="ဆိုက်ပရပ်စ်"),
    EUMemberStateEntry(code="CZ", name_en="Czechia", name_mm="ချက်ကိယား"),
    EUMemberStateEntry(code="DK", name_en="Denmark", name_mm="ဒိန်းမတ်"),
    EUMemberStateEntry(code="EE", name_en="Estonia", name_mm="အက်စ်တိုးနီးယား"),
    EUMemberStateEntry(code="FI", name_en="Finland", name_mm="ဖင်လန်"),
    EUMemberStateEntry(code="FR", name_en="France", name_mm="ဖရန့်စ်"),
    EUMemberStateEntry(code="DE", name_en="Germany", name_mm="ဂျာမနီ"),
    EUMemberStateEntry(code="GR", name_en="Greece", name_mm="ဂရိ"),
    EUMemberStateEntry(code="HU", name_en="Hungary", name_mm="ဟန်ဂေရီ"),
    EUMemberStateEntry(code="IE", name_en="Ireland", name_mm="အိုင်ယာလန်"),
    EUMemberStateEntry(code="IT", name_en="Italy", name_mm="အီတလီ"),
    EUMemberStateEntry(code="LV", name_en="Latvia", name_mm="လတ်ဘီးယား"),
    EUMemberStateEntry(code="LT", name_en="Lithuania", name_mm="လစ်သူယေးနီးယား"),
    EUMemberStateEntry(code="LU", name_en="Luxembourg", name_mm="လူဇင်ဘတ်"),
    EUMemberStateEntry(code="MT", name_en="Malta", name_mm="မယ်လ်တာ"),
    EUMemberStateEntry(code="NL", name_en="Netherlands", name_mm="နယ်သာလန်"),
    EUMemberStateEntry(code="PL", name_en="Poland", name_mm="ပိုလန်"),
    EUMemberStateEntry(code="PT", name_en="Portugal", name_mm="ပေါ်တူဂီ"),
    EUMemberStateEntry(code="RO", name_en="Romania", name_mm="ရိုမေးနီးယား"),
    EUMemberStateEntry(code="SK", name_en="Slovakia", name_mm="စလိုဗက်ကီးယား"),
    EUMemberStateEntry(code="SI", name_en="Slovenia", name_mm="စလိုဗေးနီးယား"),
    EUMemberStateEntry(code="ES", name_en="Spain", name_mm="စပိန်"),
    EUMemberStateEntry(code="SE", name_en="Sweden", name_mm="ဆွီဒင်"),
]

VALID_MEMBER_STATE_CODES = {s.code for s in EU_MEMBER_STATES}

assert len(EU_MEMBER_STATES) == 27, "EU membership changed -- update this list and its source citation"


def is_valid_member_state(code: str | None) -> bool:
    return code is None or code in VALID_MEMBER_STATE_CODES
