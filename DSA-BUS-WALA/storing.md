Yes — add a **live-data Excel export/storage pipeline** to the TODO.

 ### Add to Todo

 - [ ] Store every validated live GPS update received from the real bus API in MongoDB with:
  - Bus ID
  - Route ID
  - Latitude/longitude
  - Speed
  - Heading
  - Timestamp
  - Stop/ETA status
  - Data-source/API status
- [ ] Build a background **Live Feed → Excel exporter**.
- [ ] Append live tracking records to an Excel (`.xlsx`) file without blocking the live tracking API.
- [ ] Use **daily/hourly Excel files or sheets** to prevent one file becoming excessively large.
- [ ] Include a unique event/record ID to prevent duplicate rows.
- [ ] Preserve the exact timestamp and coordinates received from the real API.
- [ ] Add an admin option to **download/export live tracking history as Excel** for a selected date, bus or route.
- [ ] Ensure Excel export continues even when users disconnect from the live map.
- [ ] Keep MongoDB as the **primary production datastore**; Excel should be the reporting/export layer, not the primary live database.
- [ ] Add automatic archival/retention for old GPS records.

 ### Acceptance Testing — Live Excel

 - [ ] Every valid GPS update displayed on the live map is also persisted in MongoDB.
- [ ] Exported Excel contains the corresponding live GPS records with accurate timestamps and coordinates.
- [ ] No duplicate records are created when the API retries/sends the same update.
- [ ] Excel generation does **not interrupt or slow down** live bus tracking.
- [ ] A selected bus/date/route can be exported and reconciled against MongoDB records.
- [ ] If the Excel exporter temporarily fails, live tracking continues and the records are queued/retried.
- [ ] Excel files remain usable at large data volumes through scheduled partitioning/archiving.



For real bus movement, don't use simulated coordinates. Use the bus operator's actual GPS/AVL feed if available.

For your MERN project, I recommend:

    GPS source: Bus/operator GPS or AVL API → actual lat, lng, speed, heading, timestamp, busId.
    Backend: Node.js + Express receives and validates the feed.
    Real-time transport: Socket.IO/WebSockets pushes updates to Web + Android.
    Database: MongoDB stores the historical GPS points.
    Map: Google Maps Platform or Mapbox.
    Smooth movement: Client-side interpolation + GPS-noise filtering between actual GPS updates.
    Excel: Background worker exports the received live GPS records to .xlsx.
    Notifications: Firebase Cloud Messaging (FCM) for Android arrival/1-stop/2-stop alerts.

For your JD → Borgain Fata → Katol Naka requirement

The most important part is obtaining an actual live GPS API/feed for those buses. If the operator does not expose a public API, the agent should first investigate whether they provide an authenticated/private AVL feed or GTFS-Realtime feed.

Do not build the production system around a fake GPS API. If no live feed exists, the correct approach is to connect to the operator's GPS hardware/AVL system or obtain authorized access to its feed.

A good production flow is:

Bus GPS → Operator/AVL API → Node.js ingestion → MongoDB → Socket.IO → Web/Android map

and in parallel:

Live GPS records → Background worker → Excel archive

If you want, I can also give you the exact API/data architecture and folder structure the coding agent should implement for this project.
