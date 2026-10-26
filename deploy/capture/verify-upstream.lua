-- Route-scoped TLS verification for KIC 3.3, which lacks tls-verify annotations.
-- The only extra sandbox module is the existing OpenSSL certificate-store helper.
-- No caller-controlled code, certificate, filename, or hostname enters this code.
local store = require('resty.openssl.x509.store')
local roots = assert(store.new())
assert(roots:load_file('/etc/ssl/certs/ca-certificates.crt'))
return function()
  local ok = kong.service.set_tls_verify_store(roots)
  local verified = kong.service.set_tls_verify(true)
  local depth = kong.service.set_tls_verify_depth(5)
  if not ok or not verified or not depth then
    return kong.response.exit(503, {message='Capture transport unavailable'})
  end
end
