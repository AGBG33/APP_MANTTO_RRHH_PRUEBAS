
const fs = require("fs");
const path = require("path");
const {
  withAndroidManifest,
  withDangerousMod,
} = require("expo/config-plugins");

const CERT_NAME = "digicert_tls_rsa4096_root_g5.pem";

const NETWORK_XML = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <domain-config cleartextTrafficPermitted="false">
        <domain includeSubdomains="false">my-node-api-qas-01.cfapps.us10-001.hana.ondemand.com</domain>
        <trust-anchors>
            <certificates src="system" />
            <certificates src="@raw/digicert_tls_rsa4096_root_g5" />
        </trust-anchors>
    </domain-config>
</network-security-config>
`;

module.exports = function withBtpG5Trust(config) {
  config = withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];

    if (!app) {
      throw new Error("No se encontro application en AndroidManifest");
    }

    const current = app.$["android:networkSecurityConfig"];

    if (current && current !== "@xml/network_security_config") {
      throw new Error(
        "Ya existe otra configuracion de seguridad de red. Revisarla antes de continuar."
      );
    }

    app.$["android:networkSecurityConfig"] =
      "@xml/network_security_config";

    return cfg;
  });

  return withDangerousMod(config, [
    "android",
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const androidRoot = cfg.modRequest.platformProjectRoot;

      const certSource = path.join(
        projectRoot,
        "certs",
        CERT_NAME
      );

      if (!fs.existsSync(certSource)) {
        throw new Error("No se encontro el certificado DigiCert G5");
      }

      const rawDir = path.join(
        androidRoot,
        "app", "src", "main", "res", "raw"
      );

      const xmlDir = path.join(
        androidRoot,
        "app", "src", "main", "res", "xml"
      );

      fs.mkdirSync(rawDir, { recursive: true });
      fs.mkdirSync(xmlDir, { recursive: true });

      fs.copyFileSync(
        certSource,
        path.join(rawDir, CERT_NAME)
      );

      fs.writeFileSync(
        path.join(xmlDir, "network_security_config.xml"),
        NETWORK_XML,
        "utf8"
      );

      return cfg;
    },
  ]);
};
