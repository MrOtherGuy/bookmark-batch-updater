# Bookmark batch-updater

A tool to update multiple bookmarks at once. Currently only able to change http:// bookmarks to https:// but changing some domain to another should be doable in the future.

Can be used to update all bookmarks or a subset by filtering bookmarks by domain.

# Usage

1. Click the toolbarbutton to open the UI.
2. Optionally add a domain to filter bookmarks.
3. Click "Scan"
4. After scan is complete hit the update button to begin the update process.

The update may take a LONG TIME depending how many bookmarks need to be processed.

# Technicalities

The scanner and updater itself are run in the background-script. The popup UI only sends a request to the background-script to do some action and shows current status. This allows the popup to be closed while the update is running - which may take several minutes even.