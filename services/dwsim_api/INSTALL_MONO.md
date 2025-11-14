# Installing Official Mono Framework for pythonnet

## Problem
pythonnet requires the official Mono framework installed in `/Library/Frameworks/Mono.framework/...`, but Homebrew's Mono installation uses a different layout that pythonnet cannot find.

## Solution: Install Official Mono Framework

### Option 1: Install from Downloaded Package (Recommended)

The Mono installer has been downloaded to `/tmp/mono-installer.pkg`. Install it by running:

```bash
sudo installer -pkg /tmp/mono-installer.pkg -target /
```

Or simply double-click the file in Finder and follow the installation wizard.

### Option 2: Download and Install Manually

1. Visit: https://www.mono-project.com/download/stable/#download-mac
2. Download the latest Mono MDK (Mono Development Kit) for macOS
3. Open the downloaded `.pkg` file
4. Follow the installation wizard (requires admin password)

### Verify Installation

After installation, verify that Mono is installed in the correct location:

```bash
ls -la /Library/Frameworks/Mono.framework/Versions/Current/lib/libmonosgen-2.0.dylib
ls -la /Library/Frameworks/Mono.framework/Versions/Current/Commands/mono
```

Both commands should show the files exist.

### Test DWSIM Load

Once installed, test that pythonnet can now load DWSIM:

```bash
cd services/dwsim_api
source .venv/bin/activate
export DWSIM_LIB_PATH="/Applications/DWSIM.app/Contents/MonoBundle"
python test_dwsim_load.py
```

You should see: `✅ SUCCESS: DWSIM automation can be loaded!`

### Note

After installing the official Mono framework, you can remove the Homebrew Mono installation if desired (though keeping both shouldn't cause issues):

```bash
brew uninstall mono  # Optional
```

The official Mono framework will be used by pythonnet, while the Homebrew version can still be used for other purposes.

