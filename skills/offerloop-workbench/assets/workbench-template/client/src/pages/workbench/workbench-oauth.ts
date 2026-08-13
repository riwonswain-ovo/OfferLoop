const getWorkbenchOAuthRecoveryRoute = (
  pathname: string,
  search: string,
): string => {
  const workbenchPath: string = pathname.replace(
    /\/calendar-oauth-callback$/u,
    '',
  );
  const params: URLSearchParams = new URLSearchParams(search);
  params.delete('code');
  params.delete('state');
  params.delete('error');
  const nextSearch: string = params.toString();
  return nextSearch ? `${workbenchPath}?${nextSearch}` : workbenchPath;
};

export { getWorkbenchOAuthRecoveryRoute };
