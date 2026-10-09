// app/tecnico/ordenes/[orderid]/mantto-freno-pm.js
// Registro de mantenimiento de freno para máquinas tipo PM.
// Diseño simple y técnico, alineado al formulario de mantenimiento de cables.
// Incluye vista previa y generación de PDF sin validaciones bloqueantes.

import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Switch,
  Modal,
  Platform,
} from "react-native";
import { WebView } from "react-native-webview";
import { useLocalSearchParams } from "expo-router";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";

import Header from "../../../../src/components/Header";
import api from "../../../../src/services/api";
import { useAuth } from "../../../../src/context/AuthContext";

const THEME = {
  bg: "#F4F6F8",
  card: "#FFFFFF",
  soft: "#F8FAFC",
  text: "#172033",
  muted: "#667085",
  muted2: "#98A2B3",
  border: "#E4E7EC",
  borderStrong: "#D0D5DD",
  primary: "#123A72",
  primarySoft: "#EFF4FF",
  success: "#15803D",
  successSoft: "#F0FDF4",
  warning: "#B45309",
  warningSoft: "#FFFBEB",
  danger: "#B42318",
  dangerSoft: "#FEF3F2",
};

const STEPS = [
  { key: "general", title: "Datos generales", short: "General" },
  { key: "torque", title: "Torque", short: "Torque" },
  { key: "ajustes", title: "Ajustes", short: "Ajustes" },
  { key: "componentes", title: "Componentes", short: "Componentes" },
  { key: "operacion", title: "Operación", short: "Operación" },
  { key: "fotos", title: "Evidencia", short: "Fotos" },
  { key: "resultado", title: "Resultado", short: "Resultado" },
];

const safeStr = (v) => String(v ?? "").trim();

function getUserName(user) {
  return safeStr(
    user?.nombre ||
      user?.name ||
      user?.fullName ||
      user?.displayName ||
      user?.username ||
      user?.correo ||
      user?.email ||
      ""
  );
}

function getUserPayroll(user) {
  return safeStr(
    user?.nomina ||
      user?.payroll ||
      user?.employeeNumber ||
      user?.numeroNomina ||
      ""
  );
}

function fmtDate(value) {
  if (!value) return "";
  if (typeof value === "string" && value.includes("/")) return value;

  if (typeof value === "string" && value.startsWith("/Date(")) {
    const ms = Number(value.replace("/Date(", "").replace(")/", ""));
    if (Number.isFinite(ms)) value = new Date(ms);
  }

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return safeStr(value);

  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function createReviewState() {
  return {
    revisado: true,
    ajuste: false,
    revision_sma: "ok",
  };
}

function createDefaultForm(orderid = "") {
  return {
    orderid,
    tipo_reporte: "revision",
    tipo_maquina: "PM",
    tipo_mt: "",
    velocidad_nominal: "",
    capacidad: "",
    nomina: "",
    fecha: "",
    hora_inicio: "",
    hora_fin: "",

    torque_estatico: {
      dato1_antes: "",
      dato1_despues: "",
      dato2_antes: "",
      dato2_despues: "",
      dato3_antes: "",
      dato3_despues: "",
      promedio_antes: "",
      promedio_despues: "",
      estado_antes: "bien",
      estado_despues: "bien",
      ...createReviewState(),
    },

    torque_dinamico: {
      dato1_antes: "",
      dato1_despues: "",
      dato2_antes: "",
      dato2_despues: "",
      dato3_antes: "",
      dato3_despues: "",
      promedio_antes: "",
      promedio_despues: "",
      estado_antes: "bien",
      estado_despues: "bien",
      ...createReviewState(),
    },

    tornillo_ajuste: {
      izquierdo_antes: "bien",
      izquierdo_despues: "bien",
      derecho_antes: "bien",
      derecho_despues: "bien",
      ...createReviewState(),
    },

    recorrido_bobina: {
      izquierdo_antes_mm: "",
      izquierdo_despues_mm: "",
      derecho_antes_mm: "",
      derecho_despues_mm: "",
      ...createReviewState(),
    },

    recorrido_micro_switch: {
      izq_superior_antes: "bien",
      izq_superior_despues: "bien",
      izq_inferior_antes: "bien",
      izq_inferior_despues: "bien",
      der_superior_antes: "bien",
      der_superior_despues: "bien",
      der_inferior_antes: "bien",
      der_inferior_despues: "bien",
      ...createReviewState(),
    },

    funcionamiento_micro_switch: {
      izquierdo_freno1_antes: "bien",
      izquierdo_freno1_despues: "bien",
      derecho_freno2_antes: "bien",
      derecho_freno2_despues: "bien",
      ...createReviewState(),
    },

    tambor: {
      lubricante_plastico_antes: false,
      lubricante_plastico_despues: false,
      oxido_antes: false,
      oxido_despues: false,
      ...createReviewState(),
    },

    tubo_drenado: {
      conexion_antes: true,
      conexion_despues: true,
      deposito_antes: "na",
      deposito_despues: "na",
      ...createReviewState(),
    },

    operacion_freno: {
      ruido_zapata_tambor: "bien",
      ruido_cubierta_cables: "bien",
      ruido_cubiertas_polea: "bien",
      ruido_excesivo_frenos: "bien",
      revisado: true,
      revision_sma: "ok",
    },

    resultado_total: {
      bien: true,
      seguimiento: false,
      detalle: "",
    },

    fotos: {
      vista_izquierda: "",
      vista_derecha: "",
      otro_izquierdo_titulo: "",
      otro_izquierdo: "",
      otro_derecho_titulo: "",
      otro_derecho: "",
    },
  };
}

const Label = ({ children, style }) => (
  <Text style={[styles.label, style]}>{children}</Text>
);

const Input = ({ style, ...props }) => (
  <TextInput
    {...props}
    placeholderTextColor={THEME.muted2}
    style={[styles.input, style]}
  />
);

const Toggle = ({ value, onValueChange }) => (
  <Switch
    value={!!value}
    onValueChange={onValueChange}
    trackColor={{ false: "#D0D5DD", true: "#AFC7E8" }}
    thumbColor={value ? THEME.primary : "#FFFFFF"}
  />
);

function FieldRow({ children }) {
  return <View style={styles.fieldRow}>{children}</View>;
}

function Field({ children, compact = false, wide = false }) {
  return (
    <View
      style={[
        styles.field,
        compact && styles.fieldCompact,
        wide && styles.fieldWide,
      ]}
    >
      {children}
    </View>
  );
}

function Section({ title, description, children, style }) {
  return (
    <View style={[styles.section, style]}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {!!description && (
          <Text style={styles.sectionDescription}>{description}</Text>
        )}
      </View>
      {children}
    </View>
  );
}

function OrderData({ label, value, wide = false }) {
  return (
    <View style={[styles.orderData, wide && styles.orderDataWide]}>
      <Text style={styles.orderDataLabel}>{label}</Text>
      <Text style={styles.orderDataValue} numberOfLines={2}>
        {safeStr(value) || "—"}
      </Text>
    </View>
  );
}

function Choice({ active, label, onPress, tone = "primary", compact = false }) {
  const activeStyle =
    tone === "success"
      ? styles.choiceActiveSuccess
      : tone === "warning"
      ? styles.choiceActiveWarning
      : tone === "danger"
      ? styles.choiceActiveDanger
      : styles.choiceActivePrimary;

  const textStyle =
    tone === "success"
      ? styles.choiceTextSuccess
      : tone === "warning"
      ? styles.choiceTextWarning
      : tone === "danger"
      ? styles.choiceTextDanger
      : styles.choiceTextPrimary;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[styles.choice, compact && styles.choiceCompact, active && activeStyle]}
    >
      <View style={[styles.radioOuter, active && styles.radioOuterActive]}>
        {active && <View style={styles.radioInner} />}
      </View>
      <Text style={[styles.choiceText, active && textStyle]}>{label}</Text>
    </TouchableOpacity>
  );
}

function CheckChoice({ active, label, onPress, tone = "primary" }) {
  const activeStyle =
    tone === "success"
      ? styles.checkChoiceActiveSuccess
      : tone === "warning"
      ? styles.checkChoiceActiveWarning
      : tone === "danger"
      ? styles.checkChoiceActiveDanger
      : styles.checkChoiceActivePrimary;

  return (
    <TouchableOpacity
      activeOpacity={0.82}
      onPress={onPress}
      style={[styles.checkChoice, active && activeStyle]}
    >
      <View style={[styles.checkChoiceBox, active && styles.checkChoiceBoxActive]}>
        {active && <Text style={styles.checkChoiceMark}>✓</Text>}
      </View>
      <Text style={[styles.checkChoiceText, active && styles.checkChoiceTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function StatusField({ label, value, onChange, description }) {
  return (
    <View style={styles.statusRow}>
      <View style={styles.statusTextWrap}>
        <Text style={styles.statusLabel}>{label}</Text>
        {!!description && <Text style={styles.statusDescription}>{description}</Text>}
      </View>
      <View style={styles.statusChoices}>
        <Choice
          compact
          tone="success"
          active={value === "bien"}
          label="Bien"
          onPress={() => onChange("bien")}
        />
        <Choice
          compact
          tone="danger"
          active={value === "mal"}
          label="Mal"
          onPress={() => onChange("mal")}
        />
      </View>
    </View>
  );
}

function ToggleQuestion({ title, description, value, onValueChange, yesText = "Sí", noText = "No" }) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleTextWrap}>
        <Text style={styles.toggleTitle}>{title}</Text>
        {!!description && <Text style={styles.toggleDescription}>{description}</Text>}
      </View>
      <View style={styles.toggleControl}>
        <Text style={styles.toggleValue}>{value ? yesText : noText}</Text>
        <Toggle value={value} onValueChange={onValueChange} />
      </View>
    </View>
  );
}

function ReviewBlock({ value, onChange, showAdjustment = true }) {
  return (
    <View style={styles.reviewBlock}>
      <Text style={styles.reviewTitle}>Revisión del punto</Text>
      <View style={styles.reviewGrid}>
        <ToggleQuestion
          title="Revisado"
          value={!!value?.revisado}
          onValueChange={(v) => onChange({ revisado: v })}
        />
        {showAdjustment ? (
          <ToggleQuestion
            title="Requirió ajuste"
            value={!!value?.ajuste}
            onValueChange={(v) => onChange({ ajuste: v })}
          />
        ) : null}
      </View>

      <Text style={styles.reviewSubtitle}>Revisión SMA</Text>
      <View style={styles.choiceWrap}>
        <Choice
          compact
          tone="success"
          active={value?.revision_sma === "ok"}
          label="OK"
          onPress={() => onChange({ revision_sma: "ok" })}
        />
        <Choice
          compact
          tone="warning"
          active={value?.revision_sma === "seguimiento"}
          label="Necesita seguimiento"
          onPress={() => onChange({ revision_sma: "seguimiento" })}
        />
      </View>
    </View>
  );
}

function PhotoField({ label, value, onCamera, onGallery, onRemove }) {
  const hasPhoto = !!safeStr(value);

  return (
    <View style={[styles.photoField, hasPhoto && styles.photoFieldActive]}>
      <View style={styles.photoState}>
        <View style={[styles.photoDot, hasPhoto && styles.photoDotActive]} />
        <View style={styles.photoTextWrap}>
          <Text style={styles.photoLabel}>{label}</Text>
          <Text style={[styles.photoStatus, hasPhoto && styles.photoStatusActive]}>
            {hasPhoto ? "Foto agregada" : "Sin evidencia"}
          </Text>
        </View>
      </View>

      <View style={styles.photoActions}>
        <TouchableOpacity style={styles.photoButtonPrimary} onPress={onCamera}>
          <Text style={styles.photoButtonPrimaryText}>Cámara</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.photoButton} onPress={onGallery}>
          <Text style={styles.photoButtonText}>Galería</Text>
        </TouchableOpacity>
        {hasPhoto ? (
          <TouchableOpacity style={styles.photoRemove} onPress={onRemove}>
            <Text style={styles.photoRemoveText}>Quitar</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

function escHtml(value) {
  return safeStr(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function boolLabel(value) {
  return value ? "Sí" : "No";
}

function statusLabel(value) {
  return value === "mal" ? "Mal" : "Bien";
}

function smaLabel(value) {
  return value === "seguimiento" ? "Necesita seguimiento" : "OK";
}

function photoHtml(src, label) {
  if (!safeStr(src)) {
    return `<div class="photo-empty">${escHtml(label)}<br><span>Sin foto</span></div>`;
  }
  return `<div class="photo-box"><div class="photo-caption">${escHtml(label)}</div><img src="${src}" /></div>`;
}

function buildManttoFrenoPmHtml({ orden, form, user }) {
  const cliente = safeStr(orden?.cliente || orden?.Name1 || "");
  const equipo = safeStr(orden?.equipment || orden?.Equipment || orden?.equipo || "");
  const control = safeStr(orden?.Orderid || form?.orderid || "");
  const tecnico = safeStr(orden?.tecnico_nombre || getUserName(user));
  const horario = [safeStr(form?.hora_inicio), safeStr(form?.hora_fin)]
    .filter(Boolean)
    .join(" - ");

  const torqueTable = (title, data) => `
    <section class="block">
      <h3>${escHtml(title)}</h3>
      <table>
        <thead><tr><th>Valor</th><th>Antes</th><th>Después</th></tr></thead>
        <tbody>
          <tr><td>Dato #1</td><td>${escHtml(data?.dato1_antes)}</td><td>${escHtml(data?.dato1_despues)}</td></tr>
          <tr><td>Dato #2</td><td>${escHtml(data?.dato2_antes)}</td><td>${escHtml(data?.dato2_despues)}</td></tr>
          <tr><td>Dato #3</td><td>${escHtml(data?.dato3_antes)}</td><td>${escHtml(data?.dato3_despues)}</td></tr>
          <tr><td>Promedio</td><td>${escHtml(data?.promedio_antes)}</td><td>${escHtml(data?.promedio_despues)}</td></tr>
          <tr><td>Estado</td><td>${statusLabel(data?.estado_antes)}</td><td>${statusLabel(data?.estado_despues)}</td></tr>
        </tbody>
      </table>
      <div class="review-line">Revisado: ${boolLabel(data?.revisado)} &nbsp; | &nbsp; Ajuste: ${boolLabel(data?.ajuste)} &nbsp; | &nbsp; SMA: ${smaLabel(data?.revision_sma)}</div>
    </section>`;

  const statusPairRows = (rows) => rows
    .map(
      ([label, before, after]) => `
        <tr><td>${escHtml(label)}</td><td>${statusLabel(before)}</td><td>${statusLabel(after)}</td></tr>`
    )
    .join("");

  const pm = form || {};

  return `<!DOCTYPE html>
  <html lang="es">
  <head>
    <meta charset="UTF-8" />
    <style>
      @page { size: A4; margin: 11mm; }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: Arial, sans-serif; color: #111827; font-size: 10px; }
      .page { page-break-after: always; }
      .page:last-child { page-break-after: auto; }
      h1 { font-size: 16px; margin: 0 0 3px; }
      h2 { font-size: 12px; margin: 0; color: #475467; }
      h3 { font-size: 11px; margin: 0 0 6px; background: #EEF2F6; padding: 6px; border: 1px solid #CBD5E1; }
      .top { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px; }
      .conf { border:1px solid #111; padding:4px 7px; font-weight:bold; }
      .meta { display:grid; grid-template-columns:repeat(4,1fr); border:1px solid #111; margin-bottom:8px; }
      .meta > div { min-height:36px; padding:5px; border-right:1px solid #111; border-bottom:1px solid #111; }
      .meta > div:nth-child(4n) { border-right:none; }
      .meta b { display:block; font-size:8px; margin-bottom:3px; }
      .report { border:1px solid #111; padding:7px; font-weight:bold; margin-bottom:8px; }
      .block { margin-bottom:8px; break-inside:avoid; }
      table { width:100%; border-collapse:collapse; }
      th, td { border:1px solid #111; padding:4px; vertical-align:top; }
      th { background:#F2F4F7; text-align:center; }
      .review-line { border:1px solid #111; border-top:none; padding:5px; font-weight:bold; }
      .result { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:8px; }
      .result > div { border:1px solid #111; padding:7px; min-height:70px; }
      .photos { display:grid; grid-template-columns:1fr 1fr; gap:9px; }
      .photo-box, .photo-empty { border:1px solid #111; height:255px; padding:5px; display:flex; flex-direction:column; align-items:center; justify-content:center; overflow:hidden; }
      .photo-box img { max-width:100%; max-height:220px; object-fit:contain; }
      .photo-caption { width:100%; text-align:center; font-weight:bold; margin-bottom:5px; }
      .photo-empty { color:#667085; font-weight:bold; text-align:center; }
      .photo-empty span { font-weight:normal; margin-top:4px; }
      .footer { margin-top:8px; font-size:8px; display:flex; justify-content:space-between; }
    </style>
  </head>
  <body>
    <div class="page">
      <div class="top">
        <div><h1>REGISTRO DE MANTENIMIENTO DE FRENO</h1><h2>Para máquinas tipo PM</h2></div>
        <div class="conf">CONFIDENCIAL</div>
      </div>

      <div class="meta">
        <div><b>CLIENTE / MX</b>${escHtml(cliente)}</div>
        <div><b>No. EQUIPO</b>${escHtml(equipo)}</div>
        <div><b>TÉCNICO</b>${escHtml(tecnico)}<br>${escHtml(pm.nomina)}</div>
        <div><b>FECHA</b>${escHtml(pm.fecha)}</div>
        <div><b>CONTROL</b>${escHtml(control)}</div>
        <div><b>TIPO DE MÁQUINA</b>${escHtml(pm.tipo_maquina || "PM")}</div>
        <div><b>VELOCIDAD NOMINAL</b>${escHtml(pm.velocidad_nominal)} m/min</div>
        <div><b>CAPACIDAD / HORARIO</b>${escHtml(pm.capacidad)} kg<br>${escHtml(horario)}</div>
      </div>

      <div class="report">REPORTE: ${pm.tipo_reporte === "overhaul" ? "AJUSTE, REPARACIÓN Y SUSTITUCIÓN DEL FRENO (OVERHAUL)" : "REVISIÓN DE FRENO"}</div>

      ${torqueTable("1. Torque estático", pm.torque_estatico)}
      ${torqueTable("2. Torque dinámico", pm.torque_dinamico)}

      <section class="block">
        <h3>3. Tornillo de ajuste del torque</h3>
        <table><thead><tr><th>Lado</th><th>Antes</th><th>Después</th></tr></thead><tbody>
          ${statusPairRows([
            ["Izquierdo", pm.tornillo_ajuste?.izquierdo_antes, pm.tornillo_ajuste?.izquierdo_despues],
            ["Derecho", pm.tornillo_ajuste?.derecho_antes, pm.tornillo_ajuste?.derecho_despues],
          ])}
        </tbody></table>
        <div class="review-line">Revisado: ${boolLabel(pm.tornillo_ajuste?.revisado)} | Ajuste: ${boolLabel(pm.tornillo_ajuste?.ajuste)} | SMA: ${smaLabel(pm.tornillo_ajuste?.revision_sma)}</div>
      </section>

      <section class="block">
        <h3>4. Recorrido de bobina</h3>
        <table><thead><tr><th>Lado</th><th>Antes</th><th>Después</th></tr></thead><tbody>
          <tr><td>Izquierdo</td><td>${escHtml(pm.recorrido_bobina?.izquierdo_antes_mm)} mm</td><td>${escHtml(pm.recorrido_bobina?.izquierdo_despues_mm)} mm</td></tr>
          <tr><td>Derecho</td><td>${escHtml(pm.recorrido_bobina?.derecho_antes_mm)} mm</td><td>${escHtml(pm.recorrido_bobina?.derecho_despues_mm)} mm</td></tr>
        </tbody></table>
        <div class="review-line">Revisado: ${boolLabel(pm.recorrido_bobina?.revisado)} | Ajuste: ${boolLabel(pm.recorrido_bobina?.ajuste)} | SMA: ${smaLabel(pm.recorrido_bobina?.revision_sma)}</div>
      </section>

      <section class="block">
        <h3>5. Recorrido del micro switch de freno</h3>
        <table><thead><tr><th>Posición</th><th>Antes</th><th>Después</th></tr></thead><tbody>
          ${statusPairRows([
            ["Izquierdo superior", pm.recorrido_micro_switch?.izq_superior_antes, pm.recorrido_micro_switch?.izq_superior_despues],
            ["Izquierdo inferior", pm.recorrido_micro_switch?.izq_inferior_antes, pm.recorrido_micro_switch?.izq_inferior_despues],
            ["Derecho superior", pm.recorrido_micro_switch?.der_superior_antes, pm.recorrido_micro_switch?.der_superior_despues],
            ["Derecho inferior", pm.recorrido_micro_switch?.der_inferior_antes, pm.recorrido_micro_switch?.der_inferior_despues],
          ])}
        </tbody></table>
        <div class="review-line">Revisado: ${boolLabel(pm.recorrido_micro_switch?.revisado)} | Ajuste: ${boolLabel(pm.recorrido_micro_switch?.ajuste)} | SMA: ${smaLabel(pm.recorrido_micro_switch?.revision_sma)}</div>
      </section>

      <section class="block">
        <h3>6. Funcionamiento del micro switch</h3>
        <table><thead><tr><th>Freno</th><th>Antes</th><th>Después</th></tr></thead><tbody>
          ${statusPairRows([
            ["Izquierdo / Freno #1", pm.funcionamiento_micro_switch?.izquierdo_freno1_antes, pm.funcionamiento_micro_switch?.izquierdo_freno1_despues],
            ["Derecho / Freno #2", pm.funcionamiento_micro_switch?.derecho_freno2_antes, pm.funcionamiento_micro_switch?.derecho_freno2_despues],
          ])}
        </tbody></table>
        <div class="review-line">Revisado: ${boolLabel(pm.funcionamiento_micro_switch?.revisado)} | Ajuste: ${boolLabel(pm.funcionamiento_micro_switch?.ajuste)} | SMA: ${smaLabel(pm.funcionamiento_micro_switch?.revision_sma)}</div>
      </section>

      <section class="block">
        <h3>7. Condiciones de tambor</h3>
        <table><thead><tr><th>Revisión</th><th>Antes</th><th>Después</th></tr></thead><tbody>
          <tr><td>Lubricante / plástico</td><td>${boolLabel(pm.tambor?.lubricante_plastico_antes)}</td><td>${boolLabel(pm.tambor?.lubricante_plastico_despues)}</td></tr>
          <tr><td>Óxido</td><td>${boolLabel(pm.tambor?.oxido_antes)}</td><td>${boolLabel(pm.tambor?.oxido_despues)}</td></tr>
        </tbody></table>
        <div class="review-line">Revisado: ${boolLabel(pm.tambor?.revisado)} | Ajuste: ${boolLabel(pm.tambor?.ajuste)} | SMA: ${smaLabel(pm.tambor?.revision_sma)}</div>
      </section>

      <section class="block">
        <h3>8. Tubo de plástico para drenado</h3>
        <table><thead><tr><th>Revisión</th><th>Antes</th><th>Después</th></tr></thead><tbody>
          <tr><td>Conexión</td><td>${boolLabel(pm.tubo_drenado?.conexion_antes)}</td><td>${boolLabel(pm.tubo_drenado?.conexion_despues)}</td></tr>
          <tr><td>Depósito</td><td>${escHtml(pm.tubo_drenado?.deposito_antes).toUpperCase()}</td><td>${escHtml(pm.tubo_drenado?.deposito_despues).toUpperCase()}</td></tr>
        </tbody></table>
        <div class="review-line">Revisado: ${boolLabel(pm.tubo_drenado?.revisado)} | Ajuste: ${boolLabel(pm.tubo_drenado?.ajuste)} | SMA: ${smaLabel(pm.tubo_drenado?.revision_sma)}</div>
      </section>

      <section class="block">
        <h3>9. Condición de operación del freno</h3>
        <table><thead><tr><th>Revisión</th><th>Condición</th></tr></thead><tbody>
          <tr><td>Ruido entre zapata y tambor</td><td>${statusLabel(pm.operacion_freno?.ruido_zapata_tambor)}</td></tr>
          <tr><td>Ruido entre cubierta y cables</td><td>${statusLabel(pm.operacion_freno?.ruido_cubierta_cables)}</td></tr>
          <tr><td>Ruido entre cubiertas y polea</td><td>${statusLabel(pm.operacion_freno?.ruido_cubiertas_polea)}</td></tr>
          <tr><td>Ruido excesivo en frenos</td><td>${statusLabel(pm.operacion_freno?.ruido_excesivo_frenos)}</td></tr>
        </tbody></table>
        <div class="review-line">Revisado: ${boolLabel(pm.operacion_freno?.revisado)} | SMA: ${smaLabel(pm.operacion_freno?.revision_sma)}</div>
      </section>

      <div class="result">
        <div><b>RESULTADO DE LA REVISIÓN</b><br><br>${pm.resultado_total?.bien ? "☑" : "☐"} BIEN<br>${pm.resultado_total?.seguimiento ? "☑" : "☐"} NECESITA SEGUIMIENTO</div>
        <div><b>DETALLE</b><br><br>${escHtml(pm.resultado_total?.detalle)}</div>
      </div>
      <div class="footer"><span>Registro de mantenimiento PM</span><span>${escHtml(control)}</span></div>
    </div>

    <div class="page">
      <div class="top">
        <div><h1>HOJA DE FOTOS DEL MANTENIMIENTO DE FRENO</h1><h2>Máquinas tipo PM</h2></div>
        <div class="conf">CONFIDENCIAL</div>
      </div>
      <div class="meta">
        <div><b>CLIENTE / MX</b>${escHtml(cliente)}</div>
        <div><b>No. EQUIPO</b>${escHtml(equipo)}</div>
        <div><b>TÉCNICO</b>${escHtml(tecnico)}</div>
        <div><b>FECHA</b>${escHtml(pm.fecha)}</div>
      </div>
      <div class="photos">
        ${photoHtml(pm.fotos?.vista_izquierda, "Vista completa - lado izquierdo")}
        ${photoHtml(pm.fotos?.vista_derecha, "Vista completa - lado derecho")}
        ${photoHtml(pm.fotos?.otro_izquierdo, safeStr(pm.fotos?.otro_izquierdo_titulo) || "Otro - izquierdo")}
        ${photoHtml(pm.fotos?.otro_derecho, safeStr(pm.fotos?.otro_derecho_titulo) || "Otro - derecho")}
      </div>
    </div>
  </body>
  </html>`;
}

export default function ManttoFrenoPmScreen() {
  const { orderid } = useLocalSearchParams();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [orden, setOrden] = useState(null);
  const [auto, setAuto] = useState({
    orden: "",
    cliente: "",
    equipo: "",
    tecnico_nombre: "",
    start_date: "",
  });

  const [form, setForm] = useState(() => createDefaultForm(""));
  const [activeStep, setActiveStep] = useState(0);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [pdfUri, setPdfUri] = useState(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const patchForm = (patch) => {
    setPdfUri(null);
    setForm((s) => ({ ...s, ...patch }));
  };

  const patchSection = (section, patch) => {
    setPdfUri(null);
    setForm((s) => ({
      ...s,
      [section]: {
        ...(s[section] || {}),
        ...patch,
      },
    }));
  };

  const setFoto = (key, value) => {
    setPdfUri(null);
    setForm((s) => ({
      ...s,
      fotos: {
        ...(s.fotos || {}),
        [key]: value,
      },
    }));
  };

  const tomarFoto = async (key) => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permiso requerido", "Permite acceso a la cámara para tomar la evidencia.");
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.45,
        base64: true,
      });

      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset?.base64) {
        Alert.alert("Error", "No se pudo obtener la foto.");
        return;
      }

      const mime = asset?.mimeType || "image/jpeg";
      setFoto(key, `data:${mime};base64,${asset.base64}`);
    } catch (e) {
      console.log("[ManttoFrenoPm] tomarFoto error:", e);
      Alert.alert("Error", "No se pudo tomar la foto.");
    }
  };

  const seleccionarFoto = async (key) => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permiso requerido", "Permite acceso a la galería para seleccionar la evidencia.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.45,
        base64: true,
      });

      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset?.base64) {
        Alert.alert("Error", "No se pudo obtener la imagen.");
        return;
      }

      const mime = asset?.mimeType || "image/jpeg";
      setFoto(key, `data:${mime};base64,${asset.base64}`);
    } catch (e) {
      console.log("[ManttoFrenoPm] seleccionarFoto error:", e);
      Alert.alert("Error", "No se pudo seleccionar la imagen.");
    }
  };

  const cargarOrden = useCallback(async () => {
    const oid = safeStr(orderid);

    if (!oid || oid === "[orderid]") {
      setLoading(false);
      Alert.alert("Error", "No se encontró el número de orden.");
      return;
    }

    try {
      setLoading(true);
      const resOrden = await api.get(`/api/ordenes/sap/${oid}`);
      const dataOrden = resOrden?.data || {};
      let clienteFromAddress = "";

      try {
        const resAddr = await api.get(
          `/api/odata/ZCS_GET_WORKORDER_SRV/WorkOrderHeaderSet('${oid}')/ToAddresses`
        );
        const results = resAddr?.data?.d?.results || resAddr?.data?.results || [];
        clienteFromAddress = safeStr(results?.[0]?.Name1);
      } catch (addrError) {
        console.log(
          "[ManttoFrenoPm] ToAddresses error:",
          addrError?.response?.data || addrError?.message || addrError
        );
      }

      const data = {
        ...dataOrden,
        cliente: clienteFromAddress || dataOrden?.cliente || dataOrden?.Name1 || "",
      };

      const autoData = {
        orden: safeStr(data?.Orderid || data?.OrderId || oid),
        cliente: safeStr(data?.cliente || ""),
        equipo: safeStr(data?.equipment || data?.Equipment || data?.equipo || data?.Equnr || ""),
        tecnico_nombre: getUserName(user),
        start_date: safeStr(data?.start_date || data?.StartDate || data?.fecha || ""),
      };

      setOrden(data);
      setAuto(autoData);
      setForm((s) => ({
        ...s,
        orderid: autoData.orden || oid,
        fecha: s.fecha || fmtDate(autoData.start_date),
        nomina: s.nomina || getUserPayroll(user),
      }));
    } catch (e) {
      console.log("[ManttoFrenoPm] cargarOrden error:", e?.response?.data || e);
      const oid = safeStr(orderid);
      setOrden({ Orderid: oid });
      setAuto({
        orden: oid,
        cliente: "",
        equipo: "",
        tecnico_nombre: getUserName(user),
        start_date: "",
      });
      setForm((s) => ({ ...s, orderid: oid, nomina: s.nomina || getUserPayroll(user) }));
      Alert.alert(
        "Aviso",
        "No se pudieron cargar todos los datos de la orden. Puedes llenar el formulario y generar el PDF."
      );
    } finally {
      setLoading(false);
    }
  }, [orderid, user]);

  useEffect(() => {
    cargarOrden();
  }, [cargarOrden]);

  function buildHtmlActual() {
    return buildManttoFrenoPmHtml({
      orden: {
        ...(orden || {}),
        Orderid: auto?.orden || form?.orderid,
        cliente: auto?.cliente,
        equipment: auto?.equipo,
        tecnico_nombre: auto?.tecnico_nombre,
        start_date: auto?.start_date || form?.fecha,
      },
      form,
      user,
    });
  }

  const abrirPreviewPdf = async () => {
    try {
      const html = buildHtmlActual();
      setPreviewHtml(html);
      setPreviewVisible(true);
    } catch (e) {
      console.log("[ManttoFrenoPm] preview error:", e);
      Alert.alert("Error", "No se pudo generar la vista previa.");
    }
  };

  const generarPdf = async () => {
    try {
      setGeneratingPdf(true);
      const html = buildHtmlActual();
      const result = await Print.printToFileAsync({ html, base64: false });
      const cleanOrder = safeStr(auto?.orden || form?.orderid || "orden").replace(
        /[^a-zA-Z0-9_-]/g,
        "_"
      );
      const targetUri = `${FileSystem.documentDirectory}mantto_freno_pm_${cleanOrder}.pdf`;
      await FileSystem.copyAsync({ from: result.uri, to: targetUri });
      setPdfUri(targetUri);
      return targetUri;
    } finally {
      setGeneratingPdf(false);
    }
  };

  const compartirPdf = async () => {
    try {
      const uri = pdfUri || (await generarPdf());
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert("PDF generado", "El PDF se generó, pero este dispositivo no permite compartir archivos.");
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: "Compartir mantenimiento de freno PM",
      });
    } catch (e) {
      console.log("[ManttoFrenoPm] compartir error:", e);
      Alert.alert("Error", "No se pudo generar o compartir el PDF.");
    }
  };

  const goNext = () => setActiveStep((s) => Math.min(s + 1, STEPS.length - 1));
  const goBack = () => setActiveStep((s) => Math.max(s - 1, 0));

  const renderStepIndicator = () => {
    const progress = ((activeStep + 1) / STEPS.length) * 100;

    return (
      <View style={styles.stepperCard}>
        <View style={styles.stepperTopRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.stepperEyebrow}>
              Paso {activeStep + 1} de {STEPS.length}
            </Text>
            <Text style={styles.stepperTitle}>{STEPS[activeStep].title}</Text>
          </View>
          <Text style={styles.stepperPercent}>{Math.round(progress)}%</Text>
        </View>

        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.stepLinks}
        >
          {STEPS.map((step, index) => (
            <TouchableOpacity
              key={step.key}
              onPress={() => setActiveStep(index)}
              style={[styles.stepLink, index === activeStep && styles.stepLinkActive]}
            >
              <Text style={[styles.stepLinkNumber, index === activeStep && styles.stepLinkNumberActive]}>
                {index + 1}
              </Text>
              <Text style={[styles.stepLinkText, index === activeStep && styles.stepLinkTextActive]}>
                {step.short}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  };

  const renderGeneral = () => (
    <>
      <Section
        title="Orden de mantenimiento"
        description="Datos tomados de la orden y del usuario activo."
      >
        <View style={styles.orderGrid}>
          <OrderData label="Control" value={auto.orden || form.orderid} />
          <OrderData label="Cliente / MX" value={auto.cliente} />
          <OrderData label="No. equipo" value={auto.equipo} />
          <OrderData label="Técnico" value={auto.tecnico_nombre} />
        </View>
      </Section>

      <Section title="Datos generales" description="Información base del registro PM.">
        <Label>Tipo de reporte</Label>
        <View style={styles.choiceWrap}>
          <Choice
            active={form.tipo_reporte === "revision"}
            label="Revisión de freno"
            onPress={() => patchForm({ tipo_reporte: "revision" })}
          />
          <Choice
            active={form.tipo_reporte === "overhaul"}
            label="Ajuste / reparación / sustitución"
            onPress={() => patchForm({ tipo_reporte: "overhaul" })}
          />
        </View>

        <FieldRow>
          <Field>
            <Label>Fecha</Label>
            <Input value={form.fecha} onChangeText={(t) => patchForm({ fecha: t })} placeholder="DD/MM/AAAA" />
          </Field>
          <Field compact>
            <Label>Hora inicio</Label>
            <Input value={form.hora_inicio} onChangeText={(t) => patchForm({ hora_inicio: t })} placeholder="08:00" />
          </Field>
          <Field compact>
            <Label>Hora fin</Label>
            <Input value={form.hora_fin} onChangeText={(t) => patchForm({ hora_fin: t })} placeholder="10:30" />
          </Field>
        </FieldRow>

        <FieldRow>
          <Field>
            <Label>Tipo de máquina</Label>
            <Input value={form.tipo_maquina} onChangeText={(t) => patchForm({ tipo_maquina: t })} placeholder="PM" />
          </Field>
          <Field>
            <Label>Tipo de MT</Label>
            <Input value={form.tipo_mt} onChangeText={(t) => patchForm({ tipo_mt: t })} placeholder="Preventivo / Correctivo" />
          </Field>
        </FieldRow>

        <FieldRow>
          <Field compact>
            <Label>Velocidad nominal</Label>
            <Input keyboardType="numeric" value={form.velocidad_nominal} onChangeText={(t) => patchForm({ velocidad_nominal: t })} placeholder="m/min" />
          </Field>
          <Field compact>
            <Label>Capacidad</Label>
            <Input keyboardType="numeric" value={form.capacidad} onChangeText={(t) => patchForm({ capacidad: t })} placeholder="kg" />
          </Field>
          <Field compact>
            <Label>No. nómina</Label>
            <Input value={form.nomina} onChangeText={(t) => patchForm({ nomina: t })} placeholder="Nómina" />
          </Field>
        </FieldRow>
      </Section>
    </>
  );

  const renderTorqueSection = (sectionKey, title, referenceText) => {
    const data = form[sectionKey];
    return (
      <Section title={title} description={referenceText}>
        {[1, 2, 3].map((n) => (
          <FieldRow key={n}>
            <Field>
              <Label>{`Dato #${n} antes`}</Label>
              <Input keyboardType="numeric" value={data[`dato${n}_antes`]} onChangeText={(t) => patchSection(sectionKey, { [`dato${n}_antes`]: t })} placeholder="Valor" />
            </Field>
            <Field>
              <Label>{`Dato #${n} después`}</Label>
              <Input keyboardType="numeric" value={data[`dato${n}_despues`]} onChangeText={(t) => patchSection(sectionKey, { [`dato${n}_despues`]: t })} placeholder="Valor" />
            </Field>
          </FieldRow>
        ))}

        <FieldRow>
          <Field>
            <Label>Promedio antes</Label>
            <Input keyboardType="numeric" value={data.promedio_antes} onChangeText={(t) => patchSection(sectionKey, { promedio_antes: t })} placeholder="Promedio" />
          </Field>
          <Field>
            <Label>Promedio después</Label>
            <Input keyboardType="numeric" value={data.promedio_despues} onChangeText={(t) => patchSection(sectionKey, { promedio_despues: t })} placeholder="Promedio" />
          </Field>
        </FieldRow>

        <StatusField label="Estado antes" value={data.estado_antes} onChange={(v) => patchSection(sectionKey, { estado_antes: v })} />
        <StatusField label="Estado después" value={data.estado_despues} onChange={(v) => patchSection(sectionKey, { estado_despues: v })} />
        <ReviewBlock value={data} onChange={(patch) => patchSection(sectionKey, patch)} />
      </Section>
    );
  };

  const renderTorque = () => (
    <>
      {renderTorqueSection(
        "torque_estatico",
        "1. Torque estático",
        "Comprueba tres veces el valor antes y después del trabajo."
      )}
      {renderTorqueSection(
        "torque_dinamico",
        "2. Torque dinámico",
        "Realiza tres comprobaciones y registra el promedio."
      )}
    </>
  );

  const renderAjustes = () => (
    <>
      <Section title="3. Tornillo de ajuste del torque" description="Comprueba ambos lados antes y después.">
        <StatusField label="Lado izquierdo - antes" value={form.tornillo_ajuste.izquierdo_antes} onChange={(v) => patchSection("tornillo_ajuste", { izquierdo_antes: v })} />
        <StatusField label="Lado izquierdo - después" value={form.tornillo_ajuste.izquierdo_despues} onChange={(v) => patchSection("tornillo_ajuste", { izquierdo_despues: v })} />
        <StatusField label="Lado derecho - antes" value={form.tornillo_ajuste.derecho_antes} onChange={(v) => patchSection("tornillo_ajuste", { derecho_antes: v })} />
        <StatusField label="Lado derecho - después" value={form.tornillo_ajuste.derecho_despues} onChange={(v) => patchSection("tornillo_ajuste", { derecho_despues: v })} />
        <ReviewBlock value={form.tornillo_ajuste} onChange={(patch) => patchSection("tornillo_ajuste", patch)} />
      </Section>

      <Section title="4. Recorrido de bobina" description="Captura el recorrido en milímetros por lado.">
        <FieldRow>
          <Field><Label>Izquierdo antes</Label><Input keyboardType="numeric" value={form.recorrido_bobina.izquierdo_antes_mm} onChangeText={(t) => patchSection("recorrido_bobina", { izquierdo_antes_mm: t })} placeholder="mm" /></Field>
          <Field><Label>Izquierdo después</Label><Input keyboardType="numeric" value={form.recorrido_bobina.izquierdo_despues_mm} onChangeText={(t) => patchSection("recorrido_bobina", { izquierdo_despues_mm: t })} placeholder="mm" /></Field>
        </FieldRow>
        <FieldRow>
          <Field><Label>Derecho antes</Label><Input keyboardType="numeric" value={form.recorrido_bobina.derecho_antes_mm} onChangeText={(t) => patchSection("recorrido_bobina", { derecho_antes_mm: t })} placeholder="mm" /></Field>
          <Field><Label>Derecho después</Label><Input keyboardType="numeric" value={form.recorrido_bobina.derecho_despues_mm} onChangeText={(t) => patchSection("recorrido_bobina", { derecho_despues_mm: t })} placeholder="mm" /></Field>
        </FieldRow>
        <ReviewBlock value={form.recorrido_bobina} onChange={(patch) => patchSection("recorrido_bobina", patch)} />
      </Section>

      <Section title="5. Recorrido del micro switch" description="Revisa posiciones superior e inferior de ambos lados.">
        {[
          ["Izquierdo superior", "izq_superior_antes", "izq_superior_despues"],
          ["Izquierdo inferior", "izq_inferior_antes", "izq_inferior_despues"],
          ["Derecho superior", "der_superior_antes", "der_superior_despues"],
          ["Derecho inferior", "der_inferior_antes", "der_inferior_despues"],
        ].map(([label, beforeKey, afterKey]) => (
          <View key={beforeKey} style={styles.compactGroup}>
            <Text style={styles.compactGroupTitle}>{label}</Text>
            <StatusField label="Antes" value={form.recorrido_micro_switch[beforeKey]} onChange={(v) => patchSection("recorrido_micro_switch", { [beforeKey]: v })} />
            <StatusField label="Después" value={form.recorrido_micro_switch[afterKey]} onChange={(v) => patchSection("recorrido_micro_switch", { [afterKey]: v })} />
          </View>
        ))}
        <ReviewBlock value={form.recorrido_micro_switch} onChange={(patch) => patchSection("recorrido_micro_switch", patch)} />
      </Section>
    </>
  );

  const renderComponentes = () => (
    <>
      <Section title="6. Funcionamiento del micro switch" description="Comprueba el funcionamiento de freno 1 y freno 2.">
        <View style={styles.compactGroup}>
          <Text style={styles.compactGroupTitle}>Izquierdo / Freno #1</Text>
          <StatusField label="Antes" value={form.funcionamiento_micro_switch.izquierdo_freno1_antes} onChange={(v) => patchSection("funcionamiento_micro_switch", { izquierdo_freno1_antes: v })} />
          <StatusField label="Después" value={form.funcionamiento_micro_switch.izquierdo_freno1_despues} onChange={(v) => patchSection("funcionamiento_micro_switch", { izquierdo_freno1_despues: v })} />
        </View>
        <View style={styles.compactGroup}>
          <Text style={styles.compactGroupTitle}>Derecho / Freno #2</Text>
          <StatusField label="Antes" value={form.funcionamiento_micro_switch.derecho_freno2_antes} onChange={(v) => patchSection("funcionamiento_micro_switch", { derecho_freno2_antes: v })} />
          <StatusField label="Después" value={form.funcionamiento_micro_switch.derecho_freno2_despues} onChange={(v) => patchSection("funcionamiento_micro_switch", { derecho_freno2_despues: v })} />
        </View>
        <ReviewBlock value={form.funcionamiento_micro_switch} onChange={(patch) => patchSection("funcionamiento_micro_switch", patch)} />
      </Section>

      <Section title="7. Condiciones de tambor" description="Registra presencia de lubricante/plástico y óxido.">
        <View style={styles.beforeAfterHeader}><Text style={styles.beforeAfterTitle}>Antes</Text><Text style={styles.beforeAfterTitle}>Después</Text></View>
        <View style={styles.beforeAfterRow}>
          <ToggleQuestion title="Lubricante / plástico" value={form.tambor.lubricante_plastico_antes} onValueChange={(v) => patchSection("tambor", { lubricante_plastico_antes: v })} />
          <ToggleQuestion title="Lubricante / plástico" value={form.tambor.lubricante_plastico_despues} onValueChange={(v) => patchSection("tambor", { lubricante_plastico_despues: v })} />
        </View>
        <View style={styles.beforeAfterRow}>
          <ToggleQuestion title="Óxido" value={form.tambor.oxido_antes} onValueChange={(v) => patchSection("tambor", { oxido_antes: v })} />
          <ToggleQuestion title="Óxido" value={form.tambor.oxido_despues} onValueChange={(v) => patchSection("tambor", { oxido_despues: v })} />
        </View>
        <ReviewBlock value={form.tambor} onChange={(patch) => patchSection("tambor", patch)} />
      </Section>

      <Section title="8. Tubo de plástico para drenado" description="Revisa conexión y depósito antes y después.">
        <ToggleQuestion title="Conexión antes" value={form.tubo_drenado.conexion_antes} onValueChange={(v) => patchSection("tubo_drenado", { conexion_antes: v })} />
        <ToggleQuestion title="Conexión después" value={form.tubo_drenado.conexion_despues} onValueChange={(v) => patchSection("tubo_drenado", { conexion_despues: v })} />

        <Label>Depósito antes</Label>
        <View style={styles.choiceWrap}>
          {[["si", "Sí"], ["no", "No"], ["na", "N/A"]].map(([value, label]) => (
            <Choice key={value} compact active={form.tubo_drenado.deposito_antes === value} label={label} onPress={() => patchSection("tubo_drenado", { deposito_antes: value })} />
          ))}
        </View>

        <Label>Depósito después</Label>
        <View style={styles.choiceWrap}>
          {[["si", "Sí"], ["no", "No"], ["na", "N/A"]].map(([value, label]) => (
            <Choice key={value} compact active={form.tubo_drenado.deposito_despues === value} label={label} onPress={() => patchSection("tubo_drenado", { deposito_despues: value })} />
          ))}
        </View>
        <ReviewBlock value={form.tubo_drenado} onChange={(patch) => patchSection("tubo_drenado", patch)} />
      </Section>
    </>
  );

  const renderOperacion = () => (
    <Section title="9. Condición de operación del freno" description="Prueba final de funcionamiento y ruidos.">
      <StatusField label="Ruido entre zapata y tambor" value={form.operacion_freno.ruido_zapata_tambor} onChange={(v) => patchSection("operacion_freno", { ruido_zapata_tambor: v })} />
      <StatusField label="Ruido entre cubierta y cables" value={form.operacion_freno.ruido_cubierta_cables} onChange={(v) => patchSection("operacion_freno", { ruido_cubierta_cables: v })} />
      <StatusField label="Ruido entre cubiertas y polea" value={form.operacion_freno.ruido_cubiertas_polea} onChange={(v) => patchSection("operacion_freno", { ruido_cubiertas_polea: v })} />
      <StatusField label="Ruido excesivo en frenos" value={form.operacion_freno.ruido_excesivo_frenos} onChange={(v) => patchSection("operacion_freno", { ruido_excesivo_frenos: v })} />
      <ReviewBlock value={form.operacion_freno} showAdjustment={false} onChange={(patch) => patchSection("operacion_freno", patch)} />
    </Section>
  );

  const renderFotos = () => (
    <Section title="Hoja de fotos" description="Agrega la vista completa del freno y evidencia adicional.">
      <PhotoField label="Vista completa - lado izquierdo" value={form.fotos.vista_izquierda} onCamera={() => tomarFoto("vista_izquierda")} onGallery={() => seleccionarFoto("vista_izquierda")} onRemove={() => setFoto("vista_izquierda", "")} />
      <PhotoField label="Vista completa - lado derecho" value={form.fotos.vista_derecha} onCamera={() => tomarFoto("vista_derecha")} onGallery={() => seleccionarFoto("vista_derecha")} onRemove={() => setFoto("vista_derecha", "")} />

      <View style={styles.photoExtraGroup}>
        <Label>Nombre de evidencia adicional izquierda</Label>
        <Input value={form.fotos.otro_izquierdo_titulo} onChangeText={(t) => patchSection("fotos", { otro_izquierdo_titulo: t })} placeholder="Ej. Tambor / soporte" />
        <PhotoField label="Otro - lado izquierdo" value={form.fotos.otro_izquierdo} onCamera={() => tomarFoto("otro_izquierdo")} onGallery={() => seleccionarFoto("otro_izquierdo")} onRemove={() => setFoto("otro_izquierdo", "")} />
      </View>

      <View style={styles.photoExtraGroup}>
        <Label>Nombre de evidencia adicional derecha</Label>
        <Input value={form.fotos.otro_derecho_titulo} onChangeText={(t) => patchSection("fotos", { otro_derecho_titulo: t })} placeholder="Ej. Bobina / micro switch" />
        <PhotoField label="Otro - lado derecho" value={form.fotos.otro_derecho} onCamera={() => tomarFoto("otro_derecho")} onGallery={() => seleccionarFoto("otro_derecho")} onRemove={() => setFoto("otro_derecho", "")} />
      </View>
    </Section>
  );

  const renderResultado = () => (
    <Section title="Resultado de la revisión" description="Dictamen final del mantenimiento PM.">
      <View style={styles.resultChoiceGrid}>
        <CheckChoice
          tone="success"
          active={form.resultado_total.bien}
          label="Bien - la condición es buena"
          onPress={() => patchSection("resultado_total", { bien: !form.resultado_total.bien })}
        />
        <CheckChoice
          tone="warning"
          active={form.resultado_total.seguimiento}
          label="Necesita seguimiento"
          onPress={() => patchSection("resultado_total", { seguimiento: !form.resultado_total.seguimiento })}
        />
      </View>
      <Text style={styles.helperText}>Los estados no son bloqueantes; puedes marcar ambos si el reporte lo requiere.</Text>

      <Label style={{ marginTop: 16 }}>Detalle</Label>
      <Input
        multiline
        style={styles.textArea}
        value={form.resultado_total.detalle}
        onChangeText={(t) => patchSection("resultado_total", { detalle: t })}
        placeholder="Describe hallazgos, seguimiento o trabajo realizado"
      />
    </Section>
  );

  const renderStepContent = () => {
    if (activeStep === 0) return renderGeneral();
    if (activeStep === 1) return renderTorque();
    if (activeStep === 2) return renderAjustes();
    if (activeStep === 3) return renderComponentes();
    if (activeStep === 4) return renderOperacion();
    if (activeStep === 5) return renderFotos();
    return renderResultado();
  };

  if (loading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={THEME.primary} />
        <Text style={styles.loadingTitle}>Cargando formulario</Text>
        <Text style={styles.loadingText}>Preparando los datos de la orden…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Mantenimiento freno PM" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        <View style={styles.introCard}>
          <View style={styles.introTextWrap}>
            <Text style={styles.introTitle}>Reporte de mantenimiento</Text>
            <Text style={styles.introText}>
              Completa las revisiones del freno PM por secciones. Puedes revisar el PDF en cualquier momento aunque existan campos vacíos.
            </Text>
          </View>
          <TouchableOpacity style={styles.introPreviewButton} onPress={abrirPreviewPdf} disabled={generatingPdf}>
            <Text style={styles.introPreviewButtonText}>Ver PDF</Text>
          </TouchableOpacity>
        </View>

        {renderStepIndicator()}
        {renderStepContent()}

        <View style={styles.navRow}>
          <TouchableOpacity style={[styles.navBtn, activeStep === 0 && styles.navBtnDisabled]} onPress={goBack} disabled={activeStep === 0}>
            <Text style={[styles.navBtnText, activeStep === 0 && styles.navBtnTextDisabled]}>Anterior</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.navBtnPrimary, activeStep === STEPS.length - 1 && styles.navBtnDisabled]} onPress={goNext} disabled={activeStep === STEPS.length - 1}>
            <Text style={[styles.navBtnPrimaryText, activeStep === STEPS.length - 1 && styles.navBtnTextDisabled]}>Siguiente</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.previewBtn} onPress={abrirPreviewPdf} disabled={generatingPdf}>
          <Text style={styles.previewBtnText}>Vista previa</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.shareBtn} onPress={compartirPdf} disabled={generatingPdf}>
          {generatingPdf ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.shareBtnText}>Compartir PDF</Text>}
        </TouchableOpacity>
      </View>

      <Modal visible={previewVisible} transparent animationType="slide" onRequestClose={() => setPreviewVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.previewCard}>
            <View style={styles.previewHeader}>
              <View>
                <Text style={styles.previewKicker}>Documento</Text>
                <Text style={styles.previewTitle}>Vista previa PDF</Text>
              </View>
              <TouchableOpacity style={styles.previewClose} onPress={() => setPreviewVisible(false)}>
                <Text style={styles.previewCloseText}>Cerrar</Text>
              </TouchableOpacity>
            </View>
            <WebView originWhitelist={["*"]} source={{ html: previewHtml }} style={styles.webview} />
            <View style={styles.previewFooter}>
              <TouchableOpacity style={styles.shareBtn} onPress={compartirPdf} disabled={generatingPdf}>
                {generatingPdf ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.shareBtnText}>Compartir PDF</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.bg },
  loadingScreen: { flex: 1, backgroundColor: THEME.bg, justifyContent: "center", alignItems: "center", padding: 24 },
  loadingTitle: { marginTop: 14, color: THEME.text, fontSize: 18, fontWeight: "800" },
  loadingText: { marginTop: 4, color: THEME.muted, fontSize: 13, fontWeight: "500" },
  content: { padding: 16, paddingBottom: 118 },

  introCard: { backgroundColor: THEME.card, borderRadius: 16, borderWidth: 1, borderColor: THEME.border, padding: 15, flexDirection: "row", alignItems: "center", gap: 12 },
  introTextWrap: { flex: 1 },
  introTitle: { color: THEME.text, fontSize: 17, fontWeight: "800" },
  introText: { color: THEME.muted, fontSize: 12.5, lineHeight: 18, marginTop: 4, fontWeight: "500" },
  introPreviewButton: { backgroundColor: THEME.primarySoft, borderRadius: 10, paddingHorizontal: 14, minHeight: 40, alignItems: "center", justifyContent: "center" },
  introPreviewButtonText: { color: THEME.primary, fontSize: 12, fontWeight: "800" },

  stepperCard: { backgroundColor: THEME.card, borderRadius: 16, borderWidth: 1, borderColor: THEME.border, padding: 15, marginTop: 12 },
  stepperTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 },
  stepperEyebrow: { color: THEME.muted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  stepperTitle: { color: THEME.text, fontSize: 18, fontWeight: "800", marginTop: 2 },
  stepperPercent: { color: THEME.primary, fontSize: 13, fontWeight: "800" },
  progressTrack: { height: 5, borderRadius: 999, backgroundColor: "#EAECF0", overflow: "hidden", marginTop: 12 },
  progressFill: { height: "100%", borderRadius: 999, backgroundColor: THEME.primary },
  stepLinks: { gap: 7, paddingTop: 12, paddingRight: 8 },
  stepLink: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 9, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: THEME.border, backgroundColor: THEME.soft },
  stepLinkActive: { borderColor: "#B6C9E6", backgroundColor: THEME.primarySoft },
  stepLinkNumber: { color: THEME.muted, fontSize: 10, fontWeight: "800" },
  stepLinkNumberActive: { color: THEME.primary },
  stepLinkText: { color: THEME.muted, fontSize: 11, fontWeight: "600" },
  stepLinkTextActive: { color: THEME.primary, fontWeight: "800" },

  section: { backgroundColor: THEME.card, borderWidth: 1, borderColor: THEME.border, borderRadius: 16, padding: 15, marginTop: 12 },
  sectionHeader: { marginBottom: 14 },
  sectionTitle: { color: THEME.text, fontSize: 16, fontWeight: "800" },
  sectionDescription: { color: THEME.muted, fontSize: 12, lineHeight: 17, marginTop: 3, fontWeight: "500" },

  orderGrid: { flexDirection: "row", flexWrap: "wrap", columnGap: 18 },
  orderData: { flexGrow: 1, flexBasis: "46%", minWidth: 145, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: THEME.border },
  orderDataWide: { flexBasis: "100%" },
  orderDataLabel: { color: THEME.muted, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 },
  orderDataValue: { color: THEME.text, fontSize: 14, fontWeight: "700", lineHeight: 18 },

  label: { color: THEME.muted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.35, marginBottom: 6 },
  input: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: THEME.borderStrong, borderRadius: 10, paddingHorizontal: 12, paddingVertical: Platform.OS === "ios" ? 12 : 9, minHeight: 44, color: THEME.text, fontSize: 14, fontWeight: "600", marginBottom: 10 },
  textArea: { minHeight: 120, paddingTop: 12, textAlignVertical: "top" },
  fieldRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 8 },
  field: { flexGrow: 1, flexBasis: 0, minWidth: 165 },
  fieldCompact: { minWidth: 105 },
  fieldWide: { minWidth: 225 },

  choiceWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  choice: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: THEME.borderStrong, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, minHeight: 42 },
  choiceCompact: { minHeight: 36, paddingVertical: 7, paddingHorizontal: 9 },
  choiceActivePrimary: { borderColor: "#AFC4E4", backgroundColor: THEME.primarySoft },
  choiceActiveSuccess: { borderColor: "#B7DFBF", backgroundColor: THEME.successSoft },
  choiceActiveWarning: { borderColor: "#E9D3A6", backgroundColor: THEME.warningSoft },
  choiceActiveDanger: { borderColor: "#F1C1BC", backgroundColor: THEME.dangerSoft },
  choiceText: { color: THEME.text, fontSize: 12, fontWeight: "600" },
  choiceTextPrimary: { color: THEME.primary, fontWeight: "800" },
  choiceTextSuccess: { color: THEME.success, fontWeight: "800" },
  choiceTextWarning: { color: THEME.warning, fontWeight: "800" },
  choiceTextDanger: { color: THEME.danger, fontWeight: "800" },
  radioOuter: { width: 15, height: 15, borderRadius: 8, borderWidth: 1.5, borderColor: THEME.borderStrong, alignItems: "center", justifyContent: "center" },
  radioOuterActive: { borderColor: THEME.primary },
  radioInner: { width: 7, height: 7, borderRadius: 4, backgroundColor: THEME.primary },

  statusRow: { backgroundColor: THEME.soft, borderWidth: 1, borderColor: THEME.border, borderRadius: 11, padding: 11, marginBottom: 8 },
  statusTextWrap: { marginBottom: 9 },
  statusLabel: { color: THEME.text, fontSize: 13, fontWeight: "700" },
  statusDescription: { color: THEME.muted, fontSize: 11, lineHeight: 15, marginTop: 2 },
  statusChoices: { flexDirection: "row", flexWrap: "wrap", gap: 7 },

  toggleRow: { flex: 1, minWidth: 145, backgroundColor: THEME.soft, borderWidth: 1, borderColor: THEME.border, borderRadius: 11, padding: 11, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8 },
  toggleTextWrap: { flex: 1 },
  toggleTitle: { color: THEME.text, fontSize: 13, fontWeight: "700" },
  toggleDescription: { color: THEME.muted, fontSize: 11, lineHeight: 15, marginTop: 2 },
  toggleControl: { flexDirection: "row", alignItems: "center", gap: 6 },
  toggleValue: { color: THEME.muted, fontSize: 11, fontWeight: "700" },

  reviewBlock: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: THEME.border },
  reviewTitle: { color: THEME.text, fontSize: 13, fontWeight: "800", marginBottom: 8 },
  reviewGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  reviewSubtitle: { color: THEME.muted, fontSize: 10, fontWeight: "700", textTransform: "uppercase", marginTop: 4, marginBottom: 7 },

  compactGroup: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: THEME.border, borderRadius: 12, padding: 10, marginBottom: 10 },
  compactGroupTitle: { color: THEME.text, fontSize: 13, fontWeight: "800", marginBottom: 8 },
  beforeAfterHeader: { flexDirection: "row", gap: 8, marginBottom: 4 },
  beforeAfterTitle: { flex: 1, color: THEME.muted, fontSize: 10, fontWeight: "800", textTransform: "uppercase", textAlign: "center" },
  beforeAfterRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },

  checkChoice: { flexDirection: "row", alignItems: "center", gap: 9, borderWidth: 1, borderColor: THEME.borderStrong, backgroundColor: "#FFFFFF", borderRadius: 11, paddingHorizontal: 12, minHeight: 46, flex: 1, minWidth: 145 },
  checkChoiceActivePrimary: { borderColor: "#AFC4E4", backgroundColor: THEME.primarySoft },
  checkChoiceActiveSuccess: { borderColor: "#B7DFBF", backgroundColor: THEME.successSoft },
  checkChoiceActiveWarning: { borderColor: "#E9D3A6", backgroundColor: THEME.warningSoft },
  checkChoiceActiveDanger: { borderColor: "#F1C1BC", backgroundColor: THEME.dangerSoft },
  checkChoiceBox: { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: THEME.borderStrong, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF" },
  checkChoiceBoxActive: { borderColor: THEME.primary, backgroundColor: THEME.primary },
  checkChoiceMark: { color: "#FFFFFF", fontSize: 12, fontWeight: "900", lineHeight: 14 },
  checkChoiceText: { flex: 1, color: THEME.text, fontSize: 12, fontWeight: "600" },
  checkChoiceTextActive: { fontWeight: "800" },
  resultChoiceGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  helperText: { color: THEME.muted, fontSize: 11, lineHeight: 16, marginTop: 8 },

  photoField: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: THEME.border, borderRadius: 12, padding: 11, marginBottom: 9 },
  photoFieldActive: { borderColor: "#B7DFBF", backgroundColor: THEME.successSoft },
  photoState: { flexDirection: "row", alignItems: "center", gap: 9 },
  photoDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: THEME.muted2 },
  photoDotActive: { backgroundColor: THEME.success },
  photoTextWrap: { flex: 1 },
  photoLabel: { color: THEME.text, fontSize: 13, fontWeight: "700" },
  photoStatus: { color: THEME.muted, fontSize: 11, marginTop: 2 },
  photoStatusActive: { color: THEME.success, fontWeight: "700" },
  photoActions: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 10 },
  photoButtonPrimary: { backgroundColor: THEME.primary, borderRadius: 8, paddingHorizontal: 11, paddingVertical: 8 },
  photoButtonPrimaryText: { color: "#FFFFFF", fontSize: 11, fontWeight: "800" },
  photoButton: { backgroundColor: "#FFFFFF", borderRadius: 8, borderWidth: 1, borderColor: THEME.borderStrong, paddingHorizontal: 11, paddingVertical: 8 },
  photoButtonText: { color: THEME.text, fontSize: 11, fontWeight: "700" },
  photoRemove: { backgroundColor: THEME.dangerSoft, borderRadius: 8, paddingHorizontal: 11, paddingVertical: 8 },
  photoRemoveText: { color: THEME.danger, fontSize: 11, fontWeight: "800" },
  photoExtraGroup: { marginTop: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: THEME.border },

  navRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  navBtn: { flex: 1, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: THEME.borderStrong, borderRadius: 10, alignItems: "center", paddingVertical: 13 },
  navBtnPrimary: { flex: 1, backgroundColor: THEME.primary, borderWidth: 1, borderColor: THEME.primary, borderRadius: 10, alignItems: "center", paddingVertical: 13 },
  navBtnDisabled: { opacity: 0.4 },
  navBtnText: { color: THEME.text, fontSize: 14, fontWeight: "700" },
  navBtnPrimaryText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  navBtnTextDisabled: { color: THEME.muted },

  bottomBar: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 11, paddingBottom: Platform.OS === "ios" ? 25 : 13, backgroundColor: "rgba(244,246,248,0.98)", borderTopWidth: 1, borderTopColor: THEME.border },
  previewBtn: { flex: 1, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: THEME.borderStrong, borderRadius: 10, alignItems: "center", justifyContent: "center", minHeight: 48 },
  previewBtnText: { color: THEME.text, fontSize: 14, fontWeight: "700" },
  shareBtn: { flex: 1, backgroundColor: THEME.primary, borderRadius: 10, alignItems: "center", justifyContent: "center", minHeight: 48 },
  shareBtnText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.58)", padding: 12, justifyContent: "center" },
  previewCard: { flex: 1, backgroundColor: "#FFFFFF", borderRadius: 16, overflow: "hidden" },
  previewHeader: { backgroundColor: "#FFFFFF", padding: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: THEME.border },
  previewKicker: { color: THEME.muted, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 },
  previewTitle: { color: THEME.text, fontSize: 17, fontWeight: "800", marginTop: 1 },
  previewClose: { backgroundColor: THEME.soft, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 9 },
  previewCloseText: { color: THEME.text, fontSize: 12, fontWeight: "700" },
  webview: { flex: 1, backgroundColor: "#FFFFFF" },
  previewFooter: { padding: 12, borderTopWidth: 1, borderTopColor: THEME.border },
});