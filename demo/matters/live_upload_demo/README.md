# Live-upload demo scenario (fictional)

For the "judge brings an unfamiliar matter" moment. Create a new **civil recovery** matter titled
`D'Souza Boat Repairs v. Nair Fisheries (FICTIONAL)` with forum `Commercial Court, Panaji`, then:

1. Attach `1_...pdf` and `2_...docx`, run the pipeline. Expected: facts mention the trawler engine, Rs. 2,75,000 and the quality dispute (`disputed`); Proof Ledger shows tax invoice/delivery **present** and written contract **not present** (the intake note says none exists); Statute Clock shows *cause date taken from the documents* (14 Mar 2024 / 20 Mar 2024 era).
2. Attach `3_...docx` and re-run. Expected: part-payment/acknowledgment item turns **present**; clock moves to the 12 Jun 2024 acknowledgment (expiry 2027-06-12, s.18 Limitation Act).

All names, amounts and events are invented. No real client data.
