export default async (request, context) => {
  try {
    const urlObject = new URL(request.url);

    if (urlObject.pathname.startsWith("/docs") || urlObject.pathname.startsWith("/_mintlify") || urlObject.pathname.startsWith("/mintlify-assets")) {
      const DOCS_URL = "traylinx-2md-49.mintlify.app";
      const CUSTOM_URL = "2md.traylinx.com";

      let url = new URL(request.url);
      url.hostname = DOCS_URL;

      let proxyRequest = new Request(url, request);

      proxyRequest.headers.set("Host", DOCS_URL);
      proxyRequest.headers.set("X-Forwarded-Host", CUSTOM_URL);
      proxyRequest.headers.set("X-Forwarded-Proto", "https");

      return await fetch(proxyRequest);
    }
  } catch (error) {
    return context.next();
  }
};
