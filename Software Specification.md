# Software Requirement Specification
## General Overview

### Document Purpose

This document's goal is to enable clear and concise understanding of both the structure and design choices made within the project. 

### Overview
The PSI Webmap is meant to be a highly adjustable data source that can be easily used by surveyors and drafters to get relevant public data, such as The National Map's Lidar data and various Shapefile hosted online, alongside custom shapefiles hosted by a a custom POSTGIS backend(Not written in this project). The idea was to save some of the geospatial teams time by creating this definitive source to point everyone else too, that can be then added onto based off company specific information.

Of note is that to add more public datasets, all you need to do is follow the format listed in datasets.ts. Adding More to that list will automatically handle fetching more.


## Project Structure
 - App.tsx
 - main.tsx
 - index.tsx
 - Components
    - kmzUploader.tsx
    - LidarDataDisplay
    - linkDownloader.tsx
    - ResultsLayer.tsx
    - Searchbar.tsx
    - ShapefileDisplay.tsx
    - SidePanel.tsx
    -Webmap.tsx
 - lib
    - kmz.ts
    - newf.ts
    - shapefile.ts
    - utils.ts

Components are isolated in their displays, mainly draw their data from app.tsx as several things happen in parrallel in app.tsx 
index.tsx
The lib folder contains various helper functions 

### App.tsx

#### Description

App.tsx is designed to hold as little visual information as possible, instead having components which should handle most of the display logic. What app.tsx does serve as the main hub of all networking logic and routing, moving data between components. This is mainly done because situations where results of networking is within a component can be incredibly cumbersome to move laterally, as intended by how React's designed. 

Key logic handled within this file:
 handleSelectLocation
 handleAddPoint
 handleSelectItem
 handleToggleDataset
 handleLoadPolygon
 handleReset
 processSelection ****
useEffect based off processSelection


Contains:
 - Header
    - Searchbar
- WebMap
- Sidepanel


### PasswordGate.tsx
#### Description
This is a purely front-end password block. Its not secure in any capacity, but its meant to stop normal people who stumble onto the site from using it. The password itself is stored in PasswordGate using a basic variable. Of note (for my personal reference), is "  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem(STORAGE_KEY) === 'true')". The sessionStorage.getItem(STORAGE_KEY) is how you make session variables which persist between reloads, and this clears whenever the tab is properly closed. Good to know in the future.