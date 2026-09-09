# TrackMate - LLM Knowledge Base

## 1. Purpose

This file is a current working knowledge base for future AI-assisted maintenance of the TrackMate repository. It is intentionally shorter than the previous version and focuses on the information that is most useful for reasoning about the present codebase.

## 2. Project Identity

- Project name: TrackMate
- Domain: school bus tracking and transport operations
- Architecture: React frontend plus Express and Socket.IO backend
- Primary datastore: MongoDB
- Primary live mechanism: WebSocket updates from drivers to students and admins

## 3. Repository Layout

- `backend/`: API, models, trip processing, notifications, utilities
- `frontend/`: React SPA, maps, dashboards, public pages, hooks, context
- `Screenshots/`: documentation images
- root markdown files: README, project documentation, IEEE write-up, UI documentation, diagram content

## 4. Important Entry Points

### Backend

- `backend/server.js`
- `backend/config/constants.js`
- `backend/config/db.js`

### Frontend

- `frontend/src/main.jsx`
- `frontend/src/App.jsx`
- `frontend/src/context/AuthContext.jsx`
- `frontend/src/hooks/useSocket.js`

## 5. Core Runtime Concepts

### 5.1 Active Trip Flow

The critical runtime path is centered on `backend/controllers/locationController.js`.

Responsibilities:

- authenticate live socket usage,
- throttle driver location updates,
- maintain or load active trip state,
- persist bus and trip location state,
- compute and emit ETA updates,
- detect arrivals and departures,
- emit live room events,
- trigger notification logic.

### 5.2 Assignment Model

`StudentAssignment` is the main source of truth for student-to-bus and student-to-stop mapping.

Important note:

- `User.assignedBusId` and `User.assignedStopId` are legacy compatibility fields and should not be treated as the primary current model.

### 5.3 Route and Stop Model

Routes contain embedded stop arrays for efficient live processing. Separate `Stop` documents are also maintained for admin workflows and relational lookups.

The synchronization logic is in `backend/controllers/routeController.js` and `backend/controllers/stopController.js`.

## 6. Important Backend Route Groups

Mounted route groups in `server.js`:

- `/api/auth`
- `/api/routes`
- `/api/trips`
- `/api/admin`
- `/api/buses`
- `/api/driver`
- `/api/stops`
- `/api/student`
- `/api/students`
- `/api/events`
- `/api/notifications`
- `/api/public`

Important route facts:

- `/api/student` and `/api/students` use the same student route module.
- `/api/trips/*` and `/api/driver/trips/*` both exist because the project contains newer and older trip-control surfaces.
- A rate limiter is configured for `/api/auth/register`, but the current auth router does not actually mount a register endpoint.

## 7. Important Frontend Screens

- `Login`
- `AdminDashboard`
- `ManageBuses`
- `ManageDrivers`
- `ManageRoutes`
- `ManageStops`
- `AssignStudents`
- `ManageStudents`
- `DriverDashboard`
- `DriverSimulator`
- `StudentDashboard`
- `Profile`
- `TrackSelector`
- `PublicTracking`

## 8. Live Events Worth Remembering

Common WebSocket events observed in the codebase:

- `trip:location_update`
- `trip:eta_update`
- `trip:stop_arrived`
- `trip:stop_left`
- `trip:sos`
- `bus:trip_started`
- `bus:trip_ended`
- `stats:live_visitors`
- `public:subscribe`

## 9. Current Configuration Facts

Important backend constants:

- `RADIUS_METERS = 75`
- `SUSTAIN_TIME_MS = 3000`
- `LEAVE_RADIUS_METERS = 80`
- `MIN_UPDATE_INTERVAL_MS = 1000`
- `ETA_ALPHA = 0.25`
- `SEG_ALPHA = 0.15`
- `OSRM_CACHE_TTL_MS = 15000`
- `STALE_TRIP_HOURS` defaults to 12

Important operational note:

- the default admin currently seeded by startup logic is `ad1/ad1`.

## 10. Notification and Communication Facts

- Push notifications depend on VAPID configuration.
- Email support exists for onboarding and password reset.
- Invalid or expired push subscriptions are cleared when push sending fails with relevant status codes.

## 11. Public Tracking Facts

- Public list endpoint: `/api/public/buses`
- Public tracking endpoint: `/api/public/track/:busIdentifier`
- Public frontend routes: `/track` and `/track/:busName`
- Matching is tolerant of spacing and case differences in bus names and number plates.

## 12. Known Maintenance Caveats

- There is some overlap between old and newer APIs.
- Documentation must not claim a working `/api/auth/register` endpoint unless that route is explicitly mounted.
- Any future cleanup should preserve the student assignment model and real-time trip path centered on `locationController.js`.
- Changes to route and stop behavior must account for both embedded route stops and physical stop documents.

## 13. Recommended Future Cleanup Areas

- Consolidate duplicate or legacy trip-control endpoints.
- Decide whether to restore or remove student self-registration.
- Add test coverage for live trip processing and redirect behavior.
- Move more behavior-specific constants into documented config patterns if the system grows.