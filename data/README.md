# Data

Source: Cricsheet IPL ball-by-ball data, JSON format (CC-BY-4.0).

1. Go to https://cricsheet.org/downloads/
2. Under "Indian Premier League", download the JSON zip.
3. Save it here as `data/ipl_male_json.zip` (do not unzip).

Our copy:
- Downloaded: [YOUR DOWNLOAD DATE]
- Archive built by Cricsheet: 11 June 2026 (JSON format version 1.2.0)
- 1,243 matches, 18 April 2008 to 31 May 2026
- SHA-256: b7dddacecfe1d8dfe50f144eea5ba7be49ff71a85930384462e3331be304e6d6

Cricsheet updates this zip over time, so a fresh download may differ. Check the SHA-256 to
confirm you have the same file (macOS/Linux: `shasum -a 256 data/ipl_male_json.zip`).

The zip and generated files are not committed; run the scripts to recreate them.
