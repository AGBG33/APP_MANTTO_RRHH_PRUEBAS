// app/rrhh/historial.js
// Historial de asistencias RRHH: consultas SAP QAS por día, mes o año.
// Cada tarjeta representa WorkDate y muestra las cuatro horas consolidadas.
// No utiliza AsyncStorage y no modifica marcaciones existentes.
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator, FlatList, Modal, Platform, Pressable, ScrollView,
  SafeAreaView, StatusBar, StyleSheet, Text, View,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import NetInfo from "@react-native-community/netinfo";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useSapEmployee } from "../../src/context/SapEmployeeContext";
import { consultarHistorialRH, fechaLocalRH } from "../../src/services/rhHistory";
import { guardarHistorialRHCache, leerHistorialRHCache } from "../../src/rrhh/offline/rhOfflineDb";

const C = {
  bg: "#F5F6F8", white: "#FFFFFF", ink: "#202733", sub: "#647082",
  border: "#E5E8ED", red: "#D71920", pale: "#FFF1F2",
  danger: "#AF2634", soft: "#F8F9FB",
  green: "#18734F", greenSoft: "#EAF6F0", redSoft: "#FFF0ED",
};
const MODOS = [
  { id: "dia", label: "Día" },
  { id: "mes", label: "Mes" },
  { id: "anio", label: "Año" },
];
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

const ANIOS = Array.from({ length: 51 }, (_, i) => new Date().getFullYear() + 2 - i);

const fechaLocalAlMediodia = fecha => new Date(
  fecha.getFullYear(), fecha.getMonth(), fecha.getDate(), 12, 0, 0, 0,
);

function periodoDe(fecha, modo) {
  const y = fecha.getFullYear();
  const m = fecha.getMonth();
  if (modo === "anio") {
    return { desde: `${y}-01-01`, hasta: `${y}-12-31`, etiqueta: `Año ${y}` };
  }
  if (modo === "mes") {
    const ultimoDia = new Date(y, m + 1, 0, 12);
    return {
      desde: fechaLocalRH(new Date(y, m, 1, 12)),
      hasta: fechaLocalRH(ultimoDia),
      etiqueta: `${MESES[m]} de ${y}`,
    };
  }
  const dia = fechaLocalRH(fecha);
  return { desde: dia, hasta: dia, etiqueta: fecha.toLocaleDateString("es-MX", {
    day: "numeric", month: "long", year: "numeric",
  }) };
}

function nombreDia(dateISO) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateISO || ""))) return "Día sin fecha";
  const [y, m, d] = dateISO.split("-").map(Number);
  const fecha = new Date(y, m - 1, d, 12);
  return fecha.toLocaleDateString("es-MX", { weekday: "long" });
}

function fechaAmigable(dateISO) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateISO || ""))) return "Fecha no disponible";
  const [y, m, d] = dateISO.split("-").map(Number);
  const fecha = new Date(y, m - 1, d, 12);
  return fecha.toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
}

function tiempoVisible(value) {
  const hora = String(value || "").trim();
  // SAP utiliza 00:00:00 como valor inicial cuando no hay marcación.
  if (!hora || hora === "00:00:00") return "—";
  return hora;
}

function Boton({ title, icon = "search-outline", onPress, outline = false, disabled = false }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }}
    disabled={disabled} onPress={onPress}
    style={({ pressed }) => [s.button, outline && s.buttonOutline,
      disabled && s.disabled, pressed && s.pressed]}>
    <Ionicons name={icon} size={19} color={outline ? C.red : C.white}/>
    <Text style={[s.buttonText, outline && s.buttonOutlineText]}>{title}</Text>
  </Pressable>;
}

// Cuatro marcaciones en una sola cuadrícula compacta, sin cuatro tarjetas grandes.
function Tiempo({ etiqueta, valor, posicion }) {
  return <View style={[s.timeCell,
    posicion % 2 === 0 && s.timeCellLeft,
    posicion < 2 && s.timeCellTop]}>
    <Text style={s.timeLabel} numberOfLines={1}>{etiqueta}</Text>
    <Text style={s.timeValue} selectable>{tiempoVisible(valor)}</Text>
  </View>;
}

function TarjetaJornada({ jornada }) {
  const estatus = String(jornada.dayStatus || "").trim();
  // Conservar la visibilidad actual del estatus (RETARDO no se muestra).
  const mostrarEstatus = !!estatus && estatus.toUpperCase() !== "RETARDO";
  const estadoMayus = estatus.toUpperCase();
  const esPresente = estadoMayus === "PRESENTE";
  const esAusente = estadoMayus === "AUSENTE";
  const fechaISO = String(jornada.date || "");
  const fechaValida = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(fechaISO);
  const numeroDia = fechaValida ? fechaISO.slice(8) : "--";
  const mesCorto = fechaValida ? MESES[Number(fechaISO.slice(5, 7)) - 1].slice(0, 3).toUpperCase() : "---";

  return <View style={s.dayCard}>
    <View style={s.dayHeader}>
      <View style={s.dateBlock}>
        <Text style={s.dateNumber}>{numeroDia}</Text>
        <Text style={s.dateMonth}>{mesCorto}</Text>
      </View>
      <View style={s.dayHeaderText}>
        <Text style={s.weekday} numberOfLines={1}>{nombreDia(jornada.date)}</Text>
        <Text style={s.dayDate} numberOfLines={1}>{fechaAmigable(jornada.date)}</Text>
      </View>
      {mostrarEstatus && <View accessibilityLabel={`Modalidad o estado: ${estatus}`}
        style={[s.statusChip, esPresente && s.statusChipPresent, esAusente && s.statusChipAbsent]}>
        <Text numberOfLines={2} style={[s.statusValue,
          esPresente && s.statusValuePresent, esAusente && s.statusValueAbsent]}>{estatus}</Text>
      </View>}
    </View>

    <View style={s.timesGrid}>
      <Tiempo etiqueta="Entrada" valor={jornada.p10Time} posicion={0}/>
      <Tiempo etiqueta="Inicio de comida" valor={jornada.p15Time} posicion={1}/>
      <Tiempo etiqueta="Regreso de comida" valor={jornada.p25Time} posicion={2}/>
      <Tiempo etiqueta="Salida" valor={jornada.p20Time} posicion={3}/>
    </View>
  </View>;
}

export default function RHHistorial() {
  // Identidad de Microsoft ya vinculada al EmployeeSet de SAP.
  const { employee: perfilSap, email: correoCuenta, loading: perfilLoading, error: perfilError } = useSapEmployee();
  const correo = String(correoCuenta || "").trim().toLowerCase();
  // No permitir cache de una identidad diferente a la sesión validada.
  const perfilCoincide = !!perfilSap && String(perfilSap.email || "").trim().toLowerCase() === correo;
  const numeroRegistro = String(perfilSap?.personalNumber ?? "").trim();
  const nominaValida = perfilCoincide && /^\d{1,8}$/.test(numeroRegistro);

  const [modo, setModo] = useState("dia");
  const [fechaElegida, setFechaElegida] = useState(() => fechaLocalAlMediodia(new Date()));
  const [selector, setSelector] = useState(null); // dia | mes | anio
  const [anioDelMes, setAnioDelMes] = useState(() => new Date().getFullYear());
  const [aplicado, setAplicado] = useState(() => ({
    ...periodoDe(fechaLocalAlMediodia(new Date()), "dia"),
    modo: "dia", version: 0,
  }));
  const [loading, setLoading] = useState(true);
  const [jornadas, setJornadas] = useState([]);
  const [error, setError] = useState("");
  const [origenDatos, setOrigenDatos] = useState(null); // "sap" | "cache"
  const [cacheGuardadoEn, setCacheGuardadoEn] = useState(null);
  // Identifica el período confirmado: nunca mostrar jornadas de otro rango
  // (o de otra nómina) durante una nueva consulta.
  const [claveCargada, setClaveCargada] = useState("");
  const [claveError, setClaveError] = useState("");
  const claveConsulta = `${correo}|${numeroRegistro}|${aplicado.desde}|${aplicado.hasta}`;

  // Paso 3: consultar SAP cuando sea posible y conservar la respuesta correcta
  // en la base exclusiva de RRHH. Si no hay red, leer SOLO el mismo período
  // del usuario autenticado. No usar datos guardados como confirmación de SAP.
  useFocusEffect(useCallback(() => {
    if (perfilLoading) {
      setLoading(true);
      return undefined;
    }
    if (!nominaValida || !correo) {
      setError(perfilError || "No pudimos validar tu identidad y nómina con el perfil SAP.");
      setClaveError(claveConsulta);
      setClaveCargada("");
      setJornadas([]);
      setOrigenDatos(null);
      setCacheGuardadoEn(null);
      setLoading(false);
      return undefined;
    }

    let activo = true;
    const controller = new AbortController();
    const parametrosCache = {
      personalNumber: numeroRegistro,
      email: correo,
      desde: aplicado.desde,
      hasta: aplicado.hasta,
    };
    setLoading(true);
    setError("");

    const mostrarResultado = (filas, origen, guardadoEn) => {
      if (!activo) return;
      setJornadas(Array.isArray(filas) ? filas : []);
      setOrigenDatos(origen);
      setCacheGuardadoEn(guardadoEn || null);
      setClaveCargada(claveConsulta);
      setClaveError("");
    };

    const consultarCache = async () => {
      try {
        return await leerHistorialRHCache(parametrosCache);
      } catch (e) {
        if (__DEV__) console.warn("[RRHH][OFFLINE] No se pudo leer historial guardado:", e?.message || e);
        return null;
      }
    };

    const cargar = async () => {
      try {
        // La conexión física no significa necesariamente que SAP esté accesible;
        // cuando el estado sea incierto intentamos la consulta real.
        const red = await NetInfo.fetch();
        if (!activo) return;
        const sinConexion = red.isConnected === false || red.isInternetReachable === false;
        if (sinConexion) {
          const guardado = await consultarCache();
          if (!activo) return;
          if (!guardado) {
            throw new Error("Sin conexión y sin historial guardado para este período. Conéctate a internet y consulta el historial al menos una vez.");
          }
          mostrarResultado(guardado.jornadas, "cache", guardado.guardadoEn);
          return;
        }

        const { jornadas: filas } = await consultarHistorialRH({
          personalNumber: numeroRegistro,
          desde: aplicado.desde,
          hasta: aplicado.hasta,
          signal: controller.signal,
        });
        if (!activo) return;
        const jornadasRecibidas = Array.isArray(filas) ? filas : [];
        // Error de SQLite no convierte una consulta SAP exitosa en un error de pantalla.
        try {
          await guardarHistorialRHCache({ ...parametrosCache, jornadas: jornadasRecibidas });
          if (__DEV__) console.log("[RRHH][CACHE] Historial SAP guardado correctamente.");
        } catch (cacheError) {
          if (__DEV__) console.warn("[RRHH][CACHE] No se pudo guardar el historial:", cacheError?.message || cacheError);
        }
        mostrarResultado(jornadasRecibidas, "sap", Date.now());
      } catch (e) {
        if (!activo) return;
        const status = Number(e?.response?.status || 0);
        const texto = String(e?.message || "");
        const codigo = String(e?.code || "");
        // Solo usar copia local ante ausencia de red o fallos de transporte.
        // Nunca ocultar un 401/403, un rechazo de SAP o errores de validación.
        const falloDeRed = !status && (
          /ERR_NETWORK|ECONNABORTED|ETIMEDOUT|ENETUNREACH/i.test(codigo) ||
          /network error|network request failed|timeout|timed out|sin conexi[oó]n/i.test(texto)
        );
        if (falloDeRed) {
          const guardado = await consultarCache();
          if (!activo) return;
          if (guardado) {
            mostrarResultado(guardado.jornadas, "cache", guardado.guardadoEn);
            return;
          }
        }
        const mensaje = status === 401 ? "Tu sesión terminó. Inicia sesión nuevamente."
          : status === 403 ? "No tienes permiso para consultar el historial."
          : status === 404 ? "No se encontró AttendanceHistorySet en SAP QAS."
          : status >= 500 ? "SAP no está disponible. Intenta más tarde."
          : texto.startsWith("Sin conexión y sin historial guardado") ? texto
          : texto === "El historial excedió el límite de páginas. Consulta un período menor." ? texto
          : "No pudimos consultar las asistencias. Verifica tu conexión e inténtalo de nuevo.";
        setError(mensaje);
        setClaveError(claveConsulta);
      } finally {
        if (activo) setLoading(false);
      }
    };
    cargar();
    return () => { activo = false; controller.abort(); };
  }, [numeroRegistro, nominaValida, perfilLoading, perfilError, correo,
    aplicado.desde, aplicado.hasta, aplicado.version, claveConsulta]));

  // Durante una actualización del MISMO período se conservan las tarjetas
  // confirmadas con un aviso de actualización. Al cambiar el período, las tarjetas
  // anteriores desaparecen de inmediato y solo aparece el spinner.
  const datosDelPeriodo = !perfilLoading && claveCargada === claveConsulta;
  const errorDelPeriodo = !perfilLoading && !loading && !!error && claveError === claveConsulta;
  const actualizandoPeriodo = loading && datosDelPeriodo && jornadas.length > 0;
  const consultando = perfilLoading || loading || (!datosDelPeriodo && !errorDelPeriodo);
  const mostrarJornadas = datosDelPeriodo && !errorDelPeriodo && (!consultando || actualizandoPeriodo);

  // Una selección en el calendario o en las listas lanza directamente la consulta.
  // Se incrementa version incluso si se vuelve a elegir el mismo día, mes o año.
  const aplicarSeleccion = (fecha, tipo) => {
    const nuevaFecha = fechaLocalAlMediodia(fecha);
    const periodo = periodoDe(nuevaFecha, tipo);
    setFechaElegida(nuevaFecha);
    setModo(tipo);
    setAplicado(prev => ({ ...periodo, modo: tipo, version: prev.version + 1 }));
    setSelector(null);
  };

  const abrirSelector = tipo => {
    setAnioDelMes(fechaElegida.getFullYear());
    setSelector(tipo);
  };

  const cambiarDia = (evento, fecha) => {
    if (evento?.type === "dismissed" || !fecha) {
      setSelector(null);
      return;
    }
    aplicarSeleccion(fecha, "dia");
  };

  const consultarDeNuevo = () => {
    setAplicado(prev => ({ ...prev, version: prev.version + 1 }));
  };

  // Los tres filtros caben en una sola fila. Tocar uno abre su selector;
  // no hay flechas, campos de fecha adicionales ni botón Buscar.
  const Filtros = <View style={s.filterCard}>
    <View style={s.modes}>
      {MODOS.map(opcion => <Pressable key={opcion.id} accessibilityRole="button"
        accessibilityLabel={`Seleccionar por ${opcion.label.toLowerCase()}`}
        accessibilityState={{ selected: modo === opcion.id }}
        onPress={() => abrirSelector(opcion.id)}
        style={({ pressed }) => [s.mode, modo === opcion.id && s.modeActive,
          pressed && s.pressed]}>
        <Ionicons name={opcion.id === "dia" ? "calendar-outline" :
          opcion.id === "mes" ? "calendar-number-outline" : "calendar-clear-outline"}
          size={17} color={modo === opcion.id ? C.red : C.sub}/>
        <Text style={[s.modeText, modo === opcion.id && s.modeTextActive]}>{opcion.label}</Text>
      </Pressable>)}
    </View>
    <Text style={s.selectedPeriod} numberOfLines={1}>
      {aplicado.etiqueta}
    </Text>
  </View>;

  const Encabezado = <View style={s.topContent}>
    {Filtros}
    {mostrarJornadas && <View style={s.summary}>
      <Text style={s.summaryCount}>{jornadas.length} {jornadas.length === 1 ? "día registrado" : "días registrados"}</Text>
    </View>}
    {mostrarJornadas && origenDatos === "cache" && <View style={s.offlineNotice}>
      <Ionicons name="cloud-offline-outline" size={19} color={C.sub}/>
      <Text style={s.offlineNoticeText}>
        Información guardada en este dispositivo{cacheGuardadoEn ? ` · Actualizada: ${new Date(cacheGuardadoEn).toLocaleString("es-MX")}` : ""}.
        Puede haber registros más recientes en SAP.
      </Text>
    </View>}
    {consultando && <View style={[s.stateCard, actualizandoPeriodo && s.stateCompact]} accessibilityLiveRegion="polite">
      <ActivityIndicator size={actualizandoPeriodo ? "small" : "large"} color={C.red}/>
      <Text style={s.stateText}>{perfilLoading ? "Consultando tu perfil en SAP…" : actualizandoPeriodo
        ? "Actualizando historial en SAP; se muestran los datos de la última consulta confirmada."
        : "Consultando tus asistencias en SAP…"}</Text>
    </View>}
    {errorDelPeriodo && <View style={s.stateCard}>
      <Ionicons name="alert-circle-outline" size={31} color={C.danger}/>
      <Text style={s.sectionTitle}>No se pudo cargar el historial</Text>
      <Text style={s.stateText}>{error}</Text>
      <Boton title="Reintentar" icon="refresh-outline" outline onPress={consultarDeNuevo}/>
    </View>}
    {!consultando && !errorDelPeriodo && datosDelPeriodo && jornadas.length === 0 && <View style={s.stateCard}>
      <Ionicons name="calendar-clear-outline" size={32} color={C.sub}/>
      <Text style={s.sectionTitle}>Sin registros</Text>
      <Text style={s.stateText}>{origenDatos === "cache"
        ? "La última copia guardada no contiene asistencias de este período."
        : "No encontramos asistencias para el período consultado."}</Text>
    </View>}
  </View>;

  return <SafeAreaView style={s.safe}>
    <StatusBar barStyle="dark-content" backgroundColor={C.white}/>
    <View style={s.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Regresar" onPress={() => router.back()} style={s.back}>
        <Ionicons name="arrow-back" size={23} color={C.ink}/>
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={s.headerTitle}>Historial de asistencias</Text>
        <Text style={s.headerSub}>Nómina {numeroRegistro || "—"}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Actualizar historial"
        onPress={consultarDeNuevo} style={s.reload} disabled={loading}>
        <Ionicons name="refresh-outline" size={21} color={C.red}/>
      </Pressable>
    </View>

    <FlatList data={mostrarJornadas ? jornadas : []}
      keyExtractor={item => `${item.personalNumber}-${item.date}`}
      renderItem={({ item }) => <TarjetaJornada jornada={item}/>}
      ListHeaderComponent={Encabezado}
      ListFooterComponent={<View style={s.footer}>
        <Boton title="Ir a registrar asistencia" icon="finger-print-outline"
          outline onPress={() => router.push("/rrhh/asistencia")}/>
      </View>}
      contentContainerStyle={s.content}
      showsVerticalScrollIndicator={false}/>

    {selector === "dia" && Platform.OS === "android" && <DateTimePicker
      value={fechaElegida} mode="date" display="default" onChange={cambiarDia}/>}

    {Platform.OS === "ios" && <Modal visible={selector === "dia"} transparent animationType="fade"
      onRequestClose={() => setSelector(null)}>
      <View style={s.overlay}>
        <View style={s.modalCard}>
          <View style={s.modalTop}>
            <Text style={s.modalTitle}>Selecciona un día</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Cerrar calendario"
              onPress={() => setSelector(null)} style={s.modalClose}>
              <Ionicons name="close" size={22} color={C.ink}/>
            </Pressable>
          </View>
          <DateTimePicker value={fechaElegida} mode="date" display="inline"
            locale="es-MX" onChange={cambiarDia}/>
        </View>
      </View>
    </Modal>}

    <Modal visible={selector === "mes"} transparent animationType="fade"
      onRequestClose={() => setSelector(null)}>
      <View style={s.overlay}>
        <View style={s.modalCard}>
          <View style={s.modalTop}>
            <Text style={s.modalTitle}>Selecciona un mes</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Cerrar lista de meses"
              onPress={() => setSelector(null)} style={s.modalClose}>
              <Ionicons name="close" size={22} color={C.ink}/>
            </Pressable>
          </View>
          <View style={s.monthYearRow}>
            <Pressable accessibilityRole="button" accessibilityLabel="Año anterior"
              style={s.yearArrow} onPress={() => setAnioDelMes(a => a - 1)}>
              <Ionicons name="chevron-back" size={21} color={C.red}/>
            </Pressable>
            <Text style={s.monthYearValue}>{anioDelMes}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Año siguiente"
              style={s.yearArrow} onPress={() => setAnioDelMes(a => a + 1)}>
              <Ionicons name="chevron-forward" size={21} color={C.red}/>
            </Pressable>
          </View>
          <View style={s.optionGrid}>
            {MESES.map((mes, index) => {
              const elegido = modo === "mes" && fechaElegida.getMonth() === index &&
                fechaElegida.getFullYear() === anioDelMes;
              return <Pressable key={mes} accessibilityRole="button"
                accessibilityLabel={`${mes} de ${anioDelMes}`}
                onPress={() => aplicarSeleccion(new Date(anioDelMes, index, 1, 12), "mes")}
                style={({ pressed }) => [s.option, elegido && s.optionSelected, pressed && s.pressed]}>
                <Text style={[s.optionText, elegido && s.optionTextSelected]}>
                  {mes[0].toUpperCase() + mes.slice(1)}
                </Text>
              </Pressable>;
            })}
          </View>
        </View>
      </View>
    </Modal>

    <Modal visible={selector === "anio"} transparent animationType="fade"
      onRequestClose={() => setSelector(null)}>
      <View style={s.overlay}>
        <View style={[s.modalCard, s.yearModal]}>
          <View style={s.modalTop}>
            <Text style={s.modalTitle}>Selecciona un año</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Cerrar lista de años"
              onPress={() => setSelector(null)} style={s.modalClose}>
              <Ionicons name="close" size={22} color={C.ink}/>
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.optionGrid}>
            {ANIOS.map(anio => {
              const elegido = modo === "anio" && fechaElegida.getFullYear() === anio;
              return <Pressable key={anio} accessibilityRole="button"
                onPress={() => aplicarSeleccion(new Date(anio, 0, 1, 12), "anio")}
                style={({ pressed }) => [s.option, elegido && s.optionSelected, pressed && s.pressed]}>
                <Text style={[s.optionText, elegido && s.optionTextSelected]}>{anio}</Text>
              </Pressable>;
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: "row", alignItems: "center", gap: 11, padding: 14,
    backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.border },
  back: { width: 30, height: 38, justifyContent: "center" },
  headerTitle: { fontSize: 17, fontWeight: "800", color: C.ink },
  headerSub: { fontSize: 11, color: C.sub, marginTop: 3 },
  reload: { width: 38, height: 38, borderRadius: 10, backgroundColor: C.pale,
    alignItems: "center", justifyContent: "center" },
  content: { paddingHorizontal: 13, paddingTop: 13, paddingBottom: 30, gap: 10 },
  topContent: { gap: 12 },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: C.ink },
  filterCard: { backgroundColor: C.white, borderWidth: 1, borderColor: C.border,
    borderRadius: 14, padding: 10, gap: 8 },
  modes: { flexDirection: "row", gap: 7 },
  mode: { flex: 1, minHeight: 39, flexDirection: "row", gap: 6,
    alignItems: "center", justifyContent: "center", borderRadius: 9,
    borderWidth: 1, borderColor: C.border, backgroundColor: C.white },
  modeActive: { backgroundColor: C.pale, borderColor: C.red },
  modeText: { fontSize: 12.5, color: C.sub, fontWeight: "700" },
  modeTextActive: { color: C.red },
  selectedPeriod: { color: C.sub, fontSize: 11.5, textAlign: "center",
    textTransform: "capitalize" },
  button: { borderRadius: 12, minHeight: 48, backgroundColor: C.red,
    paddingHorizontal: 12, paddingVertical: 12, gap: 9, flexDirection: "row",
    alignItems: "center", justifyContent: "center" },
  buttonOutline: { backgroundColor: C.white, borderColor: C.red, borderWidth: 1 },
  buttonText: { color: C.white, fontWeight: "800", fontSize: 14 },
  buttonOutlineText: { color: C.red },
  disabled: { opacity: 0.52 },
  pressed: { opacity: 0.74 },
  summary: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", paddingHorizontal: 3 },
  summaryCount: { color: C.ink, fontWeight: "800", fontSize: 13 },
  stateCard: { borderRadius: 17, backgroundColor: C.white, borderWidth: 1,
    borderColor: C.border, padding: 26, alignItems: "center", gap: 13 },
  stateCompact: { padding: 12, flexDirection: "row", justifyContent: "center" },
  stateText: { fontSize: 12.5, color: C.sub, lineHeight: 19, textAlign: "center" },
  offlineNotice: { flexDirection: "row", alignItems: "center", gap: 9,
    borderRadius: 12, borderWidth: 1, borderColor: C.border,
    backgroundColor: C.soft, paddingHorizontal: 12, paddingVertical: 10 },
  offlineNoticeText: { flex: 1, fontSize: 11.5, lineHeight: 17, color: C.sub },
  // Una tarjeta por día: acento rojo y fecha destacada delimitan cada jornada.
  dayCard: { backgroundColor: C.white, borderRadius: 14, borderWidth: 1,
    borderColor: C.border, borderLeftWidth: 3, borderLeftColor: C.red,
    paddingHorizontal: 11, paddingTop: 10, paddingBottom: 11, gap: 9 },
  dayHeader: { flexDirection: "row", alignItems: "center", gap: 9, minHeight: 47 },
  dateBlock: { backgroundColor: C.pale, borderRadius: 9, width: 42, height: 47,
    alignItems: "center", justifyContent: "center", gap: 0 },
  dateNumber: { color: C.red, fontSize: 19, fontWeight: "800", lineHeight: 23 },
  dateMonth: { color: C.red, fontSize: 9, fontWeight: "800", letterSpacing: 0.8 },
  dayHeaderText: { flex: 1, minWidth: 0, gap: 2 },
  weekday: { color: C.ink, fontWeight: "800", fontSize: 14, textTransform: "capitalize" },
  dayDate: { color: C.sub, fontSize: 10.5, textTransform: "capitalize" },
  statusChip: { maxWidth: 105, minHeight: 23, borderRadius: 8,
    backgroundColor: C.soft, paddingHorizontal: 8, paddingVertical: 5,
    justifyContent: "center", alignItems: "center" },
  statusChipPresent: { backgroundColor: C.greenSoft },
  statusChipAbsent: { backgroundColor: C.redSoft },
  statusValue: { color: C.ink, fontWeight: "800", fontSize: 9.5, textAlign: "center" },
  statusValuePresent: { color: C.green },
  statusValueAbsent: { color: C.danger },
  // Una sola superficie con divisores discretos para las cuatro horas.
  timesGrid: { flexDirection: "row", flexWrap: "wrap", backgroundColor: C.soft,
    borderWidth: 1, borderColor: C.border, borderRadius: 10, overflow: "hidden" },
  timeCell: { width: "50%", minHeight: 47, paddingHorizontal: 10,
    paddingVertical: 6, justifyContent: "center", gap: 2 },
  timeCellLeft: { borderRightWidth: 1, borderRightColor: C.border },
  timeCellTop: { borderBottomWidth: 1, borderBottomColor: C.border },
  timeLabel: { color: C.sub, fontSize: 10.5 },
  timeValue: { fontSize: 14.5, fontWeight: "800", color: C.ink },
  footer: { marginTop: 5, marginBottom: 12 },
  overlay: { flex: 1, backgroundColor: "#0007", padding: 20, justifyContent: "center" },
  modalCard: { backgroundColor: C.white, padding: 17, borderRadius: 18, gap: 14,
    maxHeight: "82%" },
  modalTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalTitle: { color: C.ink, fontSize: 16, fontWeight: "800" },
  modalClose: { padding: 5 },
  monthYearRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 18 },
  yearArrow: { width: 40, height: 36, borderRadius: 10, borderWidth: 1,
    borderColor: C.border, justifyContent: "center", alignItems: "center" },
  monthYearValue: { width: 68, textAlign: "center", fontSize: 16, fontWeight: "800", color: C.ink },
  optionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  option: { width: "30%", minHeight: 43, borderRadius: 10, justifyContent: "center",
    alignItems: "center", backgroundColor: C.soft, borderWidth: 1, borderColor: C.border },
  optionSelected: { backgroundColor: C.pale, borderColor: C.red },
  optionText: { fontSize: 12, fontWeight: "700", color: C.ink },
  optionTextSelected: { color: C.red },
  yearModal: { maxHeight: "74%" },
});