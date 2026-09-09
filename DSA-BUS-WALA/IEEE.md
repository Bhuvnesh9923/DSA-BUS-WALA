# TrackMate: Real-Time School Bus Tracking Using WebSocket-Based Live Updates and Route-Aware ETA Estimation

## Abstract

TrackMate is a web-based school bus tracking platform developed for Ramachandra College of Engineering, Eluru. The system combines a React frontend, an Express and Socket.IO backend, and MongoDB storage to deliver live bus visibility for administrators, drivers, students, and public viewers. The platform supports route management, live trip control, ETA calculation, stop-event detection, public tracking links, push notifications, and a missed-bus redirect workflow. Unlike a static timetable model, TrackMate continuously updates trip state through driver GPS broadcasts and derives ETA using road-routing, smoothing, cached trip state, and segment-level fallback logic. The result is an operational transport platform that improves visibility, reduces uncertainty for commuters, and provides a structured base for future transport analytics.

## 1. Introduction

Educational institutions with fixed bus routes still face dynamic travel conditions such as traffic, delays, route congestion, and inconsistent departure timing. A paper schedule or group-messaging approach cannot provide accurate live movement data. Students often reach stops too early, miss buses without recovery options, or lack confidence about whether the bus is delayed or already gone.

TrackMate was designed to address that gap using a browser-first architecture. The project focuses on three practical goals:

1. Make live transport visibility available without a native mobile app.
2. Give transport administrators a centralized operational dashboard.
3. Provide students with actionable real-time information rather than static schedules.

## 2. Problem Definition

The transportation problem addressed by TrackMate has five parts:

1. Lack of live location visibility for buses.
2. Static ETA assumptions that ignore current road conditions.
3. Weak coordination between drivers, admins, and students during live trips.
4. No structured workflow for missed-bus recovery.
5. Limited ability to document stop events and transport history.

## 3. System Objectives

The implemented system aims to:

- track buses in real time,
- calculate ETA with route-aware logic,
- detect stop arrival and departure events,
- support role-based operation for admin, driver, and student users,
- provide public bus tracking pages,
- support push notifications and email-based communication,
- provide missed-bus redirection,
- export trip records and analytics for administrators.

## 4. Architecture Overview

TrackMate uses a layered web architecture.

### 4.1 Presentation Layer

The frontend is built with React 18 and Vite. It includes:

- admin, driver, and student dashboards,
- protected routing,
- public tracking pages,
- Leaflet-based map rendering,
- service worker and manifest support.

### 4.2 Application Layer

The backend is built with Express and Socket.IO. It handles:

- authentication and authorization,
- role-specific route groups,
- real-time trip processing,
- ETA generation,
- stop-event creation,
- notification workflows,
- CSV import and export,
- fleet analytics.

### 4.3 Data Layer

MongoDB is used to persist users, buses, routes, stops, trips, assignments, and stop events. In addition to database storage, the system uses in-memory active trip state during live processing to reduce repeated recalculation and to maintain efficient ETA and stop-detection flow.

## 5. Core Modules

### 5.1 Admin Module

The admin module provides:

- bus management,
- driver management,
- route and stop management,
- student management,
- student assignment to buses and stops,
- active-trip monitoring,
- live bus map,
- event history,
- analytics summary,
- CSV export.

### 5.2 Driver Module

The driver module provides:

- assigned bus visibility,
- trip start and end controls,
- location transmission,
- simulator mode,
- SOS generation,
- trip progress view.

### 5.3 Student Module

The student module provides:

- current assignment lookup,
- live bus location,
- ETA to assigned stop,
- recent stop events,
- notification preference management,
- personal assignment update,
- missed-bus redirect,
- redirect cancellation.

### 5.4 Public Module

The public module exposes:

- a public bus selector page,
- public bus tracking by bus identifier,
- live bus visibility without authentication for currently running trips.

## 6. Data Model Summary

The main collections are:

- `User`
- `Bus`
- `Route`
- `Stop`
- `Trip`
- `StudentAssignment`
- `StopEvent`

`StudentAssignment` is the current source of truth for student-to-bus and student-to-stop mapping. Legacy assignment fields still exist on `User`, but current documentation and current operational logic should be treated as assignment-driven.

## 7. Live Tracking Workflow

The live trip sequence is:

1. Driver logs in and starts a trip.
2. A `Trip` document is created with status `ONGOING`.
3. Driver GPS updates are transmitted through Socket.IO.
4. The backend throttles and validates updates.
5. Bus last-known location and trip breadcrumbs are stored.
6. ETA is computed using OSRM and fallback logic.
7. The current stop window is checked for arrival and departure.
8. Stop events are persisted when state transitions occur.
9. Updates are broadcast to subscribed dashboards.
10. Notification logic evaluates whether push or email actions should fire.

## 8. ETA and Stop Detection

TrackMate does not rely on a single ETA strategy. It combines:

- road-duration lookup through OSRM,
- short-term caching of route duration results,
- smoothing to stabilize live ETA values,
- segment statistics for learned route behavior,
- speed-based fallback estimation.

Stop detection uses a radius-and-dwell model. A bus must remain inside the configured zone for a sustained period before arrival is confirmed, and it must move beyond a leave radius before departure is marked. This avoids false triggers caused by GPS drift.

## 9. Missed-Bus Redirect

The redirect workflow is one of the system's distinctive features. When a student reports a missed bus:

1. The student's current assignment is loaded.
2. Ongoing trips other than the student's own bus are examined.
3. Candidate routes are checked for a matching stop name.
4. Trips that have already passed that stop are rejected.
5. Same-route alternatives are preferred.
6. The lowest ETA candidate is selected.
7. Redirect state is stored in memory and exposed back to the student dashboard.

## 10. Notifications and Communication

TrackMate supports two communication modes:

- Web Push notifications using VAPID keys when configured.
- Email workflows for onboarding and password reset.

Push notifications are tied to saved browser subscriptions and are used for test notifications, proximity alerts, arrival alerts, and SOS-related messaging where applicable.

## 11. Deployment Model

The system is designed for cloud deployment:

- frontend on a static hosting platform,
- backend on a Node-capable service,
- database on MongoDB Atlas,
- routing support through OSRM,
- email delivery through Brevo.

This separation allows the interface and API to scale independently.

## 12. Results and Practical Value

The implemented system demonstrates that a browser-based architecture is sufficient for a campus transport use case when real-time WebSocket updates, map-based visualization, and moderate PWA support are combined carefully. The project already delivers measurable operational value:

- lower uncertainty for students,
- better operational visibility for admins,
- structured trip records,
- support for emergency signaling,
- a workable base for transport analytics.

## 13. Limitations

Current limitations include:

- duplicated legacy and newer route patterns in parts of the API,
- a registration controller that exists without a currently mounted public register route,
- dependence on network connectivity for real-time experience,
- limited automated testing coverage,
- redirect state stored only in memory.

## 14. Conclusion

TrackMate is a practical real-time transport platform rather than a prototype-only demo. Its architecture already supports live operations, role-based dashboards, event logging, and public bus visibility. The next stage of improvement should focus on endpoint consolidation, stronger test coverage, and deeper analytics rather than a major architectural rewrite.