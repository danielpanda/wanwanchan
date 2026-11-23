# Homebrew Cask for a custom tap.
#
# Setup (once you have published a GitHub release):
#   1. Create a repo named  homebrew-wanwanchan  and put this file at  Casks/wanwanchan.rb
#   2. Upload WanWan-chan_<version>_universal.dmg to a GitHub release tagged v<version>
#   3. Replace YOUR_GITHUB_USER and the sha256 (printed by `npm run release`)
#   4. Users install with:
#        brew tap YOUR_GITHUB_USER/wanwanchan
#        brew install --cask wanwanchan
cask "wanwanchan" do
  version "0.2.2"
  sha256 "REPLACE_WITH_SHA256_OF_DMG"

  url "https://github.com/YOUR_GITHUB_USER/wanwanchan/releases/download/v#{version}/WanWan-chan_#{version}_universal.dmg"
  name "WanWan-chan"
  desc "Lightweight pixel pet for the macOS desktop"
  homepage "https://github.com/YOUR_GITHUB_USER/wanwanchan"

  depends_on macos: ">= :big_sur"

  app "WanWan-chan.app"

  zap trash: [
    "~/Library/Application Support/com.wanwanchan.app",
    "~/Library/LaunchAgents/WanWan-chan.plist",
    "~/Library/WebKit/com.wanwanchan.app",
    "~/Library/Caches/com.wanwanchan.app",
  ]
end
