const fs = require('fs');
const path = require('path');
const forge = require('node-forge');

// Create SSL directory if it doesn't exist
const sslDir = path.join(__dirname, '..', 'ssl');
if (!fs.existsSync(sslDir)) {
  fs.mkdirSync(sslDir, { recursive: true });
}

console.log('Generating self-signed SSL certificate using Node.js...');

try {
  // Generate a key pair
  const keys = forge.pki.rsa.generateKeyPair(2048);

  // Create a certificate
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  
  // Set certificate attributes
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
  
  const attrs = [{
    name: 'commonName',
    value: 'localhost'
  }, {
    name: 'countryName',
    value: 'US'
  }, {
    shortName: 'ST',
    value: 'State'
  }, {
    name: 'localityName',
    value: 'City'
  }, {
    name: 'organizationName',
    value: 'WebRTC Voice Call'
  }, {
    shortName: 'OU',
    value: 'Development'
  }];
  
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  
  // Set extensions
  cert.setExtensions([{
    name: 'basicConstraints',
    cA: true
  }, {
    name: 'keyUsage',
    keyCertSign: true,
    digitalSignature: true,
    nonRepudiation: true,
    keyEncipherment: true,
    dataEncipherment: true
  }, {
    name: 'subjectAltName',
    altNames: [{
      type: 2, // DNS
      value: 'localhost'
    }, {
      type: 7, // IP
      ip: '127.0.0.1'
    }]
  }]);
  
  // Self-sign the certificate
  cert.sign(keys.privateKey, forge.md.sha256.create());
  
  // Convert to PEM format
  const privateKeyPem = forge.pki.privateKeyToPem(keys.privateKey);
  const certPem = forge.pki.certificateToPem(cert);
  
  // Write the key and certificate to files
  fs.writeFileSync(path.join(sslDir, 'server.key'), privateKeyPem);
  fs.writeFileSync(path.join(sslDir, 'server.crt'), certPem);
  
  console.log('SSL certificate generated successfully!');
} catch (error) {
  console.error('Error generating SSL certificate:', error.message);
}