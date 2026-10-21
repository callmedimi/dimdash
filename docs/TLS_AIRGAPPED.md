# DimDash Air-Gapped TLS & Internal CA Guide

This guide details the procedure for establishing trusted TLS transport in completely isolated, air-gapped local area networks (LANs).

---

## 1. Why TLS is Mandatory in Air-Gapped Networks

Even in isolated physical networks with no internet connectivity, modern browsers enforce the **Secure Context** specification (W3C / WHATWG). Several critical DimDash dashboard features require a Secure Context (`https://` or `http://localhost`):

1. **Screen Wake Lock API (`navigator.wakeLock`)**: Prevents unattended kiosk wallboards from sleeping or turning off screens.
2. **Async Clipboard API (`navigator.clipboard`)**: Required for copying widget configurations, token strings, and export payloads.
3. **Service Workers & Offline Caching (`navigator.serviceWorker`)**: Enables instant local caching of icons, stylesheets, and layouts.
4. **Permissions Policy**: Enforces hardware feature lockdowns (camera, microphone, geolocation restrictions).

When serving over plain HTTP across LAN IP addresses (e.g. `http://192.168.1.50:3080`), browsers treat the origin as insecure and disable these capabilities. Configuring an internal Certificate Authority (CA) restores full capability without external internet access.

---

## 2. Generating an Internal Air-Gapped Root CA

Generate a private Root CA on an air-gapped administration workstation using standard OpenSSL tools:

### Step 2.1: Generate the Root CA Private Key & Certificate
```bash
# Generate 4096-bit RSA private key for the Root CA
openssl genrsa -out dimdash-root-ca.key 4096

# Generate self-signed Root CA certificate valid for 10 years (3650 days)
openssl req -x509 -new -nodes -key dimdash-root-ca.key -sha256 -days 3650 \
  -subj "/C=US/ST=Local/L=Airgap/O=DimDash/OU=Operations/CN=DimDash Internal Root CA" \
  -out dimdash-root-ca.crt
```

Store `dimdash-root-ca.key` securely with permissions restricted to `chmod 0400`.

---

## 3. Issuing Server Certificates with SAN (Subject Alternative Names)

Server certificates must include Subject Alternative Names (SAN) matching all hostnames and IP addresses used to reach the DimDash server.

### Step 3.1: Create OpenSSL Extension Configuration (`dimdash-server.ext`)
```ini
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names

[alt_names]
DNS.1 = dimdash.local
DNS.2 = dashboard.lan
DNS.3 = localhost
IP.1 = 127.0.0.1
IP.2 = 192.168.1.50
IP.3 = 10.0.0.10
```

### Step 3.2: Generate Server Private Key and CSR
```bash
# Generate 2048-bit server private key
openssl genrsa -out dimdash-server.key 2048

# Generate Certificate Signing Request (CSR)
openssl req -new -key dimdash-server.key \
  -subj "/C=US/ST=Local/L=Airgap/O=DimDash/OU=Dashboard/CN=dimdash.local" \
  -out dimdash-server.csr
```

### Step 3.3: Sign Server Certificate with Internal Root CA
```bash
openssl x509 -req -in dimdash-server.csr \
  -CA dimdash-root-ca.crt \
  -CAkey dimdash-root-ca.key \
  -CAcreateserial \
  -out dimdash-server.crt \
  -days 1095 \
  -sha256 \
  -extfile dimdash-server.ext
```

---

## 4. Configuring DimDash for Built-In TLS

DimDash natively supports TLS via environment variables. When configured, the Node.js server serves HTTPS on the designated port:

```bash
export DIMDASH_TLS_CERT="/path/to/dimdash-server.crt"
export DIMDASH_TLS_KEY="/path/to/dimdash-server.key"
export PORT=3443

node server/index.js
```

### Optional Reverse Proxy (Caddy / Nginx)
If deploying behind a local Caddy reverse proxy:
```caddy
dimdash.local:443 {
    tls /etc/ssl/dimdash-server.crt /etc/ssl/dimdash-server.key
    reverse_proxy 127.0.0.1:3080
}
```

---

## 5. Installing the Root CA on Kiosk Displays & Client Machines

To prevent browser security warnings on wall-mounted displays and workstations, trust `dimdash-root-ca.crt` on client operating systems.

### 5.1 Debian / Ubuntu / Raspberry Pi OS Kiosks
```bash
# Copy certificate to system trust anchor
sudo cp dimdash-root-ca.crt /usr/local/share/ca-certificates/dimdash-root-ca.crt

# Update OS certificate database
sudo update-ca-certificates
```

### 5.2 Chromium / Chrome NSS Database (Linux Kiosks)
Chromium on Linux reads from the NSS shared database:
```bash
sudo apt-get install -y libnss3-tools

# Import and mark trusted for SSL (flag 'C,,')
mkdir -p $HOME/.pki/nssdb
certutil -d sql:$HOME/.pki/nssdb -A -t "C,," \
  -n "DimDash Internal Root CA" \
  -i dimdash-root-ca.crt

# Verify certificate is in database
certutil -d sql:$HOME/.pki/nssdb -L
```

### 5.3 Chromium Kiosk Launch Command
Launch Chromium in kiosk mode with hardware acceleration and clean cache flags:
```bash
chromium-browser \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --check-for-update-interval=31536000 \
  --disable-features=TranslateUI \
  https://dimdash.local?k=kiosk_YOUR_DISPLAY_TOKEN
```

### 5.4 Windows Kiosk Clients
Run in an elevated PowerShell:
```powershell
Import-Certificate -FilePath .\dimdash-root-ca.crt -CertStoreLocation Cert:\LocalMachine\Root
```

### 5.5 macOS Clients
```bash
sudo security add-trusted-cert -d -r trustRoot \
  -k /Library/Keychains/System.keychain dimdash-root-ca.crt
```

---

## 6. Verifying Secure Context & Transport Security

Once configured, verify in the browser DevTools console:
```javascript
window.isSecureContext === true; // Must return true
navigator.wakeLock !== undefined; // Must return true
```

The server automatically applies strict HSTS, CSP, and COOP/CORP security headers under TLS transport.
