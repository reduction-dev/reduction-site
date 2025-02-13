import React from 'react';

interface Platform {
  os: string;
  arch: string;
  display: string;
}

const PLATFORMS: Platform[] = [
  { os: 'darwin', arch: 'amd64', display: 'macOS (Intel)' },
  { os: 'darwin', arch: 'arm64', display: 'macOS (Apple Silicon)' },
  { os: 'linux', arch: 'amd64', display: 'Linux (x86_64)' },
  { os: 'linux', arch: 'arm64', display: 'Linux (ARM64)' },
];

interface DownloadLinksProps {
  version: string;
  children: (props: ChildrenProps) => React.ReactNode;
}

interface ChildrenProps {
  key: string;
  url: string;
  displayName: string;
}

export function DownloadLinks(props: DownloadLinksProps) {
  return PLATFORMS.map((platform: Platform) => (
    props.children({
      key: `${platform.os}-${platform.arch}`,
      url: `https://github.com/reduction-dev/reduction/releases/download/v${props.version}/reduction_${props.version}_${platform.os}_${platform.arch}`,
      displayName: platform.display,
    })
  ))
}
