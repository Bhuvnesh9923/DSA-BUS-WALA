# CHAPTER 4 - SYSTEM DESIGN DIAGRAMS

This file contains Mermaid code for the Chapter 4 diagrams of TrackMate. The diagrams are based on the current implementation in the React frontend, Express and Socket.IO backend, and MongoDB data layer.

---

## 4.2 System Architecture

Figure 4.1: System Architecture of TrackMate

```mermaid
flowchart LR
    subgraph Users[Users]
        Admin[Administrator]
        Driver[Driver]
        Student[Student]
        Public[Public User]
    end

    subgraph Presentation[Presentation Layer]
        Frontend[React + Vite Frontend\nRole-based Dashboards\nAdmin / Driver / Student / Public Tracking]
        Maps[Leaflet Map Views\nLive Bus Position and ETA]
    end

    subgraph Application[Application Layer]
        API[Express REST API\nAuth, Buses, Routes, Stops, Trips, Students]
        Socket[Socket.IO Server\nLive Location and Trip Events]
        Logic[Business Logic\nTrip Control, ETA, Geo-fencing, Notifications]
        Services[External Services\nOSRM, Email, Web Push]
    end

    subgraph Data[Data Layer]
        Mongo[(MongoDB)]
        Cache[(In-Memory Active Trip State)]
    end

    Admin --> Frontend
    Driver --> Frontend
    Student --> Frontend
    Public --> Frontend

    Frontend --> API
    Frontend --> Socket
    Maps --> Frontend

    API --> Logic
    Socket --> Logic
    Logic --> Mongo
    Logic --> Cache
    Logic --> Services
    API --> Mongo
    Socket --> Cache
```

---

## 4.3 Use Case Diagram

Figure 4.2: Use Case Diagram for TrackMate System

```mermaid
flowchart TB
    Admin[Administrator]
    Driver[Driver]
    Student[Student]
    Public[Public User]

    Login((Login))
    ManageBuses((Manage Buses))
    ManageRoutes((Manage Routes))
    ManageStops((Manage Stops))
    ManageAssignments((Manage Student Assignments))
    MonitorTrips((Monitor Active Trips))
    ViewAnalytics((View Reports and Analytics))

    StartTrip((Start Trip))
    ShareLocation((Send Live GPS Updates))
    TriggerEmergency((Trigger SOS Alert))
    EndTrip((End Trip))

    TrackAssignedBus((Track Assigned Bus))
    ViewETA((View ETA))
    ManageAlerts((Manage Notification Preferences))
    ReportMissedBus((Report Missed Bus))
    ViewRedirect((View Alternative Bus Redirect))

    PublicTrack((View Public Tracking Page))

    Admin --> Login
    Admin --> ManageBuses
    Admin --> ManageRoutes
    Admin --> ManageStops
    Admin --> ManageAssignments
    Admin --> MonitorTrips
    Admin --> ViewAnalytics

    Driver --> Login
    Driver --> StartTrip
    Driver --> ShareLocation
    Driver --> TriggerEmergency
    Driver --> EndTrip

    Student --> Login
    Student --> TrackAssignedBus
    Student --> ViewETA
    Student --> ManageAlerts
    Student --> ReportMissedBus
    Student --> ViewRedirect

    Public --> PublicTrack
```

---

## 4.4 Entity Relationship Diagram (ER Diagram)

Figure 4.3: Entity Relationship Diagram for TrackMate

```mermaid
erDiagram
    USER {
        objectId _id
        string username
        string password
        string role
        string name
        string phone
        string email
        boolean firstLogin
    }

    BUS {
        objectId _id
        string name
        string numberPlate
        int capacity
        objectId driver
        objectId route
        boolean isActive
    }

    ROUTE {
        objectId _id
        string name
        object geojson
        array stops
        array segStats
    }

    STOP {
        objectId _id
        string name
        float latitude
        float longitude
        int sequence
        objectId route
    }

    TRIP {
        objectId _id
        objectId bus
        objectId driver
        objectId route
        string status
        int currentStopIndex
        date startedAt
        date endedAt
    }

    STUDENT_ASSIGNMENT {
        objectId _id
        objectId student
        objectId bus
        objectId stop
        object notificationPreferences
    }

    STOP_EVENT {
        objectId _id
        objectId trip
        objectId stop
        int stopIndex
        string stopName
        string status
        date timestamp
    }

    USER ||--o{ TRIP : drives
    USER ||--o{ STUDENT_ASSIGNMENT : receives
    USER o|--o{ BUS : assigned_as_driver
    ROUTE ||--o{ STOP : contains
    ROUTE ||--o{ BUS : assigned_to
    BUS ||--o{ TRIP : runs
    BUS ||--o{ STUDENT_ASSIGNMENT : assigned_to_students
    STOP ||--o{ STUDENT_ASSIGNMENT : selected_pickup
    TRIP ||--o{ STOP_EVENT : logs
    STOP o|--o{ STOP_EVENT : references
```

---

## 4.5 Data Flow Diagram (DFD)

Figure 4.4: Data Flow Diagram for TrackMate System

```mermaid
flowchart LR
    Admin[Administrator]
    Driver[Driver]
    Student[Student]
    Public[Public User]

    P1[Process 1\nAuthentication and Authorization]
    P2[Process 2\nTransport Master Data Management]
    P3[Process 3\nTrip Execution and Live Tracking]
    P4[Process 4\nETA and Student Tracking]
    P5[Process 5\nNotifications and Reporting]

    D1[(Users Collection)]
    D2[(Buses Collection)]
    D3[(Routes and Stops Collections)]
    D4[(Trips Collection)]
    D5[(StudentAssignments Collection)]
    D6[(StopEvents Collection)]

    Admin --> P1
    Driver --> P1
    Student --> P1

    Admin --> P2
    Driver --> P3
    Student --> P4
    Public --> P4
    Admin --> P5

    P1 <--> D1
    P2 <--> D1
    P2 <--> D2
    P2 <--> D3
    P2 <--> D5
    P3 <--> D2
    P3 <--> D4
    P3 <--> D6
    P4 <--> D4
    P4 <--> D5
    P4 <--> D6
    P5 <--> D4
    P5 <--> D6
```

---

## 4.6 Sequence Diagram

Figure 4.5: Sequence Diagram for Real-Time Bus Tracking

```mermaid
sequenceDiagram
    actor Driver
    participant DriverUI as Driver Dashboard
    participant TripAPI as Trip Controller
    participant Socket as Socket.IO Server
    participant Location as Location Controller
    participant ETA as ETA Calculator
    participant DB as MongoDB
    participant StudentUI as Student Dashboard
    participant AdminUI as Admin Dashboard

    Driver->>DriverUI: Login and tap Start Trip
    DriverUI->>TripAPI: POST /api/trips/start
    TripAPI->>DB: Create trip with ONGOING status
    DB-->>TripAPI: Trip saved
    TripAPI-->>DriverUI: Active trip response

    loop During active trip
        Driver->>DriverUI: Share GPS location
        DriverUI->>Socket: driver:location_update
        Socket->>Location: Forward location payload
        Location->>DB: Update bus and trip location
        Location->>ETA: Compute ETA for next stops
        ETA-->>Location: ETA values
        Location->>DB: Save stop events when ARRIVED or LEFT
        Location-->>StudentUI: trip:location_update and trip:eta_update
        Location-->>AdminUI: trip:location_update and fleet updates
    end

    Driver->>DriverUI: End trip
    DriverUI->>TripAPI: POST /api/trips/end
    TripAPI->>DB: Mark trip as COMPLETED
    DB-->>TripAPI: Trip updated
    TripAPI-->>DriverUI: Trip closed
```

---

## 4.7 Database Schema Design

Figure 4.6: Database Schema for TrackMate

```mermaid
classDiagram
    class UserCollection {
        _id:ObjectId
        username:String
        password:String
        role:String
        name:String
        phone:String
        email:String
        firstLogin:Boolean
        driverMeta.bus:ObjectId
    }

    class BusCollection {
        _id:ObjectId
        name:String
        numberPlate:String
        capacity:Number
        driver:ObjectId
        route:ObjectId
        isActive:Boolean
        lastKnownLocation:Object
    }

    class RouteCollection {
        _id:ObjectId
        name:String
        geojson:Object
        stops:Array
        segStats:Array
    }

    class StopCollection {
        _id:ObjectId
        name:String
        latitude:Number
        longitude:Number
        sequence:Number
        route:ObjectId
        averageTravelMinutes:Number
    }

    class TripCollection {
        _id:ObjectId
        bus:ObjectId
        driver:ObjectId
        route:ObjectId
        status:String
        currentStopIndex:Number
        startedAt:Date
        endedAt:Date
        lastLocation:Object
        locations:Array
    }

    class StudentAssignmentCollection {
        _id:ObjectId
        student:ObjectId
        bus:ObjectId
        stop:ObjectId
        notificationToken:String
        notificationPreferences:Object
    }

    class StopEventCollection {
        _id:ObjectId
        trip:ObjectId
        stop:ObjectId
        stopIndex:Number
        stopName:String
        status:String
        timestamp:Date
        location:Object
        source:String
    }

    UserCollection <-- BusCollection : driver
    RouteCollection <-- BusCollection : route
    RouteCollection <-- StopCollection : route
    BusCollection <-- TripCollection : bus
    UserCollection <-- TripCollection : driver
    RouteCollection <-- TripCollection : route
    UserCollection <-- StudentAssignmentCollection : student
    BusCollection <-- StudentAssignmentCollection : bus
    StopCollection <-- StudentAssignmentCollection : stop
    TripCollection <-- StopEventCollection : trip
    StopCollection <-- StopEventCollection : stop
```
