const buildServerBaseUrl = () => {
  const configuredApiBase = import.meta.env.VITE_API_BASE_URL;

  if (configuredApiBase) {
    if (configuredApiBase.startsWith('http://') || configuredApiBase.startsWith('https://')) {
      return configuredApiBase.replace(/\/api\/?$/, '');
    }

    if (configuredApiBase.startsWith('/')) {
      return `${window.location.origin}${configuredApiBase}`.replace(/\/api\/?$/, '');
    }
  }

  return `${window.location.protocol}//${window.location.hostname}:5000`;
};

export const SERVER_BASE_URL = buildServerBaseUrl();

export const toServerAssetUrl = (assetPath) => {
  if (!assetPath) return null;
  if (assetPath.startsWith('http://') || assetPath.startsWith('https://')) {
    return assetPath;
  }

  const normalizedPath = assetPath.startsWith('/') ? assetPath : `/${assetPath}`;
  return `${SERVER_BASE_URL}${normalizedPath}`;
};
