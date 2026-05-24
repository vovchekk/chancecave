# 🐺 Wolf Game Cave Mapper Extension

A browser extension that provides a live auto-mapping overlay for Wolf Game Cave (caves.wolf.game).

## Features

- **Live Map** - Automatically builds a map as you explore
- **Heat Map** - Shows walked vs seen tiles in different colors
- **💎 Shinies** - Tracks all collectible item locations
- **⚡ Hazards** - Tracks traps and electric fences
- **🪜 Extraction Points** - Tracks extraction locations
- **Export** - Download JSON file for use with wolfgamecavemapper.com

## Installation

### Chrome / Brave / Edge

1. Download and unzip the extension folder
2. Open your browser and go to:
   - Chrome: `chrome://extensions`
   - Brave: `brave://extensions`
   - Edge: `edge://extensions`
3. Enable **Developer mode** (toggle in top right)
4. Click **Load unpacked**
5. Select the `wolf-cave-mapper-extension` folder
6. The extension icon should appear in your toolbar

### Firefox

Firefox requires a slightly different manifest format. Contact the developer for a Firefox version.

## Usage

1. Navigate to https://caves.wolf.game
2. The mapper overlay will automatically appear in the top-right corner
3. Walk around - the map builds automatically!
4. **Scroll** on the map to zoom in/out
5. **Drag** on the map to pan around
6. **Drag** the header bar to move the panel
7. Click **Center** to re-center on your position
8. Click **Export** to download your map data as JSON

## Map Legend

- **Bright blue tiles** - Tiles you've walked on
- **Dark blue tiles** - Tiles you've seen but not walked on
- **💎 Cyan gems** - Shiny locations
- **⚡ Yellow lightning** - Hazard locations (traps/fences)
- **🪜 Green ladders** - Extraction points
- **Red dot** - Your current position

## Export Format

The exported JSON file contains:

```json
{
  "shinies": [{"x": 50, "y": 50}, ...],
  "fences": [{"x": 51, "y": 50}, ...],
  "extracts": [{"x": 52, "y": 50}, ...]
}
```

Import this file into [wolfgamecavemapper.com](https://wolfgamecavemapper.com) for route planning!

## Links

- Website: [chancethebettor.io](https://chancethebettor.io)
- Cave Mapper Tool: [wolfgamecavemapper.com](https://wolfgamecavemapper.com)

## Version History

- **1.0.0** - Initial release
  - Live auto-mapping
  - Shiny, hazard, and extraction tracking
  - JSON export for route planning

## License

MIT License - Feel free to modify and share!

# chancecave
