// app/rrhh/asistencia.js
// Check-in QAS: se selecciona modalidad ANTES de la entrada, y se bloquea tras el primer POST.
// Confianza X: PR / HO / VN; sindicalizado Y: solo PR.
// Estado de jornada basado en acuses locales; ABAP debe validar duplicados en backend.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, AppState, KeyboardAvoidingView, Modal, Platform, Pressable,
  SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { router, useFocusEffect } from "expo-router";
import { useSapEmployee } from "../../src/context/SapEmployeeContext";
import { useAuth } from "../../src/context/AuthContext";
import { capturarMarcacionOfflineRH } from "../../src/rrhh/offline/rhOfflineCapture";
import { leerHistorialRHCache, guardarHistorialRHCache,
  iniciarConsultaHistorialRH } from "../../src/rrhh/offline/rhOfflineDb";
import { listarMarcacionesPendientesRH, leerBitacoraMarcacionRH } from "../../src/rrhh/offline/rhPendingDb";
import { suscribirSincronizacionRH, sincronizarPendientesRH } from "../../src/rrhh/offline/rhOfflineSync";
import {
  verificarMarcacionGuardadaRH,
  autorizarReenvioMarcacionGuardadaRH,
  autorizarReenvioJustificacionGuardadaRH,
} from "../../src/rrhh/offline/rhOfflineReview";
import { prepararMarcacionRH, enviarMarcacionRH } from "../../src/services/rhAttendance";
import { prepararJustificacionRH, enviarJustificacionRH } from "../../src/services/rhJustifications";
import { consultarHistorialRH } from "../../src/services/rhHistory";
import { consultarRetardosRH, cicloRetardosRH } from "../../src/services/rhDelays";
import { guardarRetardosRHCache, leerRetardosRHCache, leerCuartoRetardoRH } from "../../src/rrhh/offline/rhDelaysCache";
import { obtenerEmpleadoRH } from "../../src/services/rhEmployees";
import { esHomeOfficeEmpleadoRH, esViajeRH, semanaLaboralRH, mesLaboralRH,
  resumirReglasRH, movimientosDesdeHistoryRH } from "../../src/services/rhBusinessRules";
import { clasificarEmpleadoRH, evaluarMarcacionRH, hoyISO, modalidadesPermitidasRH,
  obtenerTurnoDelDia, registrosDeJornadaRH, fechaHoraRegistroRH,
  horaCorta, codigoModalidadRH, TIPOS_RH } from "../../src/services/rhPolicies";

const C = { bg: "#F5F6F8", white: "#FFFFFF", ink: "#202733", sub: "#647082",
  border: "#E5E8ED", red: "#D71920", pale: "#FFF1F2", green: "#18764C",
  greenBg: "#E9F6EE", blue: "#375A80", blueBg: "#EDF4FC", amber: "#95610C",
  amberBg: "#FFF7E8", danger: "#AF2634" };
const PREFIX = "rh:demo:attendance:v2:"; // Conserva acuses anteriores sin perderlos.
const norm = p => /^\d{1,8}$/.test(String(p ?? "").trim())
  ? String(p).trim().padStart(8, "0") : "";
const mailOK = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || "")) && String(v).length <= 241;
const MAP = {
  entrada: { title: "Entrada", icon: "log-in-outline" },
  comida_inicio: { title: "Inicio de comida", icon: "restaurant-outline" },
  comida_fin: { title: "Regreso de comida", icon: "play-outline" },
  salida: { title: "Salida", icon: "log-out-outline" },
};
const ORDEN = ["entrada", "comida_inicio", "comida_fin", "salida"];
const TIPO_DESDE_CODIGO = Object.fromEntries(
  Object.entries(TIPOS_RH).map(([tipo, codigo]) => [codigo, tipo])
);
const etiquetaEstadoOffline = estado => ({
  pendiente: "Pendiente de envío",
  enviando: "Envío por verificar",
  incierto: "Resultado incierto",
  confirmado: "Confirmado por SAP",
  rechazado: "Rechazado por SAP",
  revision: "Requiere revisión",
})[estado] || "Requiere revisión";
const errorDeSapRH = e => {
  const data = e?.response?.data;
  const raw = e?.sapMessage || data?.error?.message?.value || data?.error?.message ||
    data?.Message || data?.message || (typeof data === "string" ? data : "") || e?.message;
  const message = typeof raw === "string" ? raw : "";
  const status = e?.sapStatus || data?.d?.StatusReq || data?.d?.Status || "";
  const http = e?.httpStatus || e?.response?.status || "";
  return `${message || "No se recibió detalle del error."}${status ? ` · Estado SAP: ${status}` : ""}${http ? ` · HTTP ${http}` : ""}`.slice(0, 550);
};
const rechazoConfirmadoRH = e => !!e?.sapRejected || [400, 403, 404, 409, 422].includes(e?.response?.status);
// Conversión local sin UTC para que el calendario conserve el día seleccionado.
const fechaParaPicker = value => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ""));
  if (!m) return new Date();
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
};
const fechaCorta = value => value
  ? fechaParaPicker(value).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })
  : "Seleccionar fecha";
const ultimo = (items, tipo) => items.filter(x => x.type === tipo).sort((a,b) =>
  `${b.date}|${b.time}`.localeCompare(`${a.date}|${a.time}`))[0] || null;

function Btn({ title, icon, onPress, outline = false, disabled = false, danger = false, loading = false }) {
  const inhabilitado = disabled || loading;
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: inhabilitado }} disabled={inhabilitado} onPress={onPress}
    style={({ pressed }) => [s.btn, outline && s.btnOutline, danger && s.btnDanger,
      disabled && s.disabled, pressed && s.pressed]}>
    {loading ? <ActivityIndicator size="small" color={outline ? (danger ? C.danger : C.red) : C.white}/>
      : <Ionicons name={icon || "checkmark-circle-outline"} size={19} color={outline ? (danger ? C.danger : C.red) : C.white}/>}
    <Text style={[s.btnText, outline && { color: danger ? C.danger : C.red }]}>{title}</Text>
  </Pressable>;
}
function CardTitle({ title, sub, icon }) {
  return <View style={s.sectionHeader}><Ionicons name={icon} size={21} color={C.red}/>
    <View style={{ flex: 1 }}><Text style={s.sectionTitle}>{title}</Text>
      {!!sub && <Text style={s.sub}>{sub}</Text>}</View></View>;
}
function Pick({ title, selected, onPress, disabled }) {
  return <Pressable disabled={disabled} onPress={onPress} accessibilityRole="button"
    accessibilityState={{ selected, disabled }} style={[s.choice, selected && s.choiceSelected, disabled && s.disabled]}>
    <Ionicons name={selected ? "radio-button-on" : "radio-button-off"} size={20} color={selected ? C.red : C.sub}/>
    <Text style={[s.choiceText, selected && { color: C.red }]}>{title}</Text></Pressable>;
}

export default function RHAsistencia() {
  const { ensureValidToken } = useAuth();
  // No se aceptan parámetros de navegación para la identidad del empleado.
  const { employee: perfilSap, email: correoAzure, loading: perfilLoading, error: perfilError, refresh: refreshPerfil, origenPerfil } = useSapEmployee();
  const personalNumber = norm(perfilSap?.personalNumber);
  const numeroRegistro = String(perfilSap?.personalNumber ?? "").trim();
  const correo = String(correoAzure || "").trim();
  const storageKey = `${PREFIX}${personalNumber}`;
  // La clave de modalidad se calcula después de leer la hora de la jornada.
  const [employee, setEmployee] = useState(null);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [modalidad, setModalidad] = useState("Presencial");
  // NULL significa que el personal de confianza AÚN no ha seleccionado modalidad.
  const [modalidadGuardada, setModalidadGuardada] = useState(null);
  const [bloqueoModalidadSinDatos, setBloqueoModalidadSinDatos] = useState(false);
  const [viajeDesde, setViajeDesde] = useState("");
  const [viajeHasta, setViajeHasta] = useState("");
  const [viajePicker, setViajePicker] = useState(null); // "desde" o "hasta"
  const [extraOpen, setExtraOpen] = useState(false);
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // La sincronización solo muestra progreso en el botón; no recarga la pantalla.
  const [sincronizandoRH, setSincronizandoRH] = useState(false);
  const [actualizandoSAP, setActualizandoSAP] = useState(false);
  const [mensajeSync, setMensajeSync] = useState("");
  const busyRef = useRef(false);
  const [dialog, setDialog] = useState(null);
  const [motivo, setMotivo] = useState("Laboral");
  const [comentario, setComentario] = useState("");
  const [recuperarTiempo, setRecuperarTiempo] = useState(false);
  const [ahora, setAhora] = useState(() => new Date());
  const [syncTick, setSyncTick] = useState(0);
  // La cola de RRHH se consulta por identidad; NUNCA usar la cola de mantenimiento.
  const [sinConexion, setSinConexion] = useState(null);
  const [colaRH, setColaRH] = useState({ identidad: "", filas: [], cargando: true, error: "" });
  const [revisionColaRH, setRevisionColaRH] = useState(0);
  // Total mensual confirmado por ProcessingDelaysSet y bloqueo local durable.
  // La cache de otra cuenta o mes nunca habilita una marcacion.
  const [retardosOffline, setRetardosOffline] = useState({
    identidad: "", fechaJornada: "", totalDelays: null,
    totalAbsences: null, vigente: false, cargando: true, cuartoLocal: false,
  });
  // La misma pantalla usa la ultima jornada confirmada por SAP cuando no hay internet.
  // Es solo una copia de consulta; JAMAS equivale a una nueva confirmacion SAP.
  const [historialOffline, setHistorialOffline] = useState({
    identidad: "", fechaJornada: "", jornadas: [], guardadoEn: 0,
    cargando: false, error: "",
  });
  // El agente global sigue funcionando fuera de esta pantalla. Durante una
  // sincronización manual NO lanzamos otra consulta simultánea a SAP: la misma
  // acción refrescará la jornada una sola vez al terminar.
  useEffect(() => suscribirSincronizacionRH(evento => {
    if (busyRef.current) return;
    if (evento.evento === "finalizado") {
      setRevisionColaRH(n => n + 1);
      setSyncTick(n => n + 1);
    }
  }), []);

  // Las filas de otra cuenta NUNCA se muestran mientras cambia la sesión.
  const identidadColaRH = `${personalNumber}|${correo.toLowerCase()}`;
  const colaActualRH = colaRH.identidad === identidadColaRH;
  const pendientesOffline = colaActualRH ? colaRH.filas : [];
  const cargandoColaRH = !colaActualRH || colaRH.cargando;
  const errorColaRH = colaActualRH ? colaRH.error : "";
  const [estadoSAP, setEstadoSAP] = useState({ verificado: false, cargando: true, error: "",
    perfil: null, jornadasMes: [], jornadasSemana: [], resumen: null, fechaJornada: "" });
  // Al abrir la pantalla se revalida el historial y el perfil directamente con
  // EmployeeSet, sin reiniciar el perfil global de SapEmployeeProvider.
  // Forzar refreshPerfil() aqui ponia temporalmente employee=null/loading=true
  // durante la navegacion y podia hacer que la pantalla pareciera cerrarse.
  useFocusEffect(useCallback(() => {
    setSyncTick(n => n + 1);
    setRevisionColaRH(n => n + 1);
    return undefined;
  }, []));

  // El indicador de conexion sirve solo para elegir la interfaz. El motor
  // rhOfflineCapture valida otra vez la ausencia de internet antes de guardar.
  useEffect(() => {
    let activo = true;
    const actualizarConexion = red => {
      if (!activo) return;
      const offline = red.isConnected === false || red.isInternetReachable === false;
      setSinConexion(prev => prev === offline ? prev : offline);
    };
    NetInfo.fetch().then(actualizarConexion).catch(() => {
      if (activo) setSinConexion(null); // Estado desconocido: NO habilitar offline.
    });
    const unsubscribe = NetInfo.addEventListener(actualizarConexion);
    return () => { activo = false; unsubscribe?.(); };
  }, []);

  // Consultar siempre la cola al abrir la pantalla, incluso cuando haya red:
  // asi una marcacion offline antigua bloquea nuevos POST hasta conciliar con SAP.
  useEffect(() => {
    let activo = true;
    const identidad = `${personalNumber}|${correo.toLowerCase()}`;
    // No vaciar los registros visibles mientras se actualiza la MISMA cuenta.
    // Al cambiar de identidad sí se descarta inmediatamente la cola anterior.
    setColaRH(prev => prev.identidad === identidad
      ? prev : { identidad, filas: [], cargando: true, error: "" });
    if (!personalNumber || !mailOK(correo)) {
      setColaRH({ identidad, filas: [], cargando: false, error: "" });
      return () => { activo = false; };
    }
    listarMarcacionesPendientesRH({ personalNumber, email: correo })
      .then(filas => {
        if (!activo) return;
        // Diagnostico sin correo, nomina ni payload: permite comprobar
        // si el registro offline sigue almacenado en SQLite.
        if (__DEV__) console.log("[RRHH][COLA][RESUMEN]", filas.map(f => ({
          tipo: f.tipo, fechaJornada: f.fechaJornada,
          estado: f.estado, justificacionEstado: f.justificacionEstado,
        })));
        setColaRH({ identidad, filas, cargando: false, error: "" });
      })
      .catch(err => {
        if (!activo) return;
        setColaRH({ identidad, filas: [], cargando: false,
          error: "No se pudo verificar la cola local de RRHH. No se realizarán nuevas marcaciones hasta revisar el almacenamiento." });
        if (__DEV__) console.warn("[RRHH][OFFLINE] Fallo lectura cola:", err?.message || err);
      });
    return () => { activo = false; };
  }, [personalNumber, correo, revisionColaRH]);
  const turnoPerfil = perfilSap ? obtenerTurnoDelDia(perfilSap.scheduleDetail, ahora) : null;
  // Si el turno del sábado finaliza el domingo, continúa usando la modalidad del sábado.
  const modalidadKey = `rh:modalidad:q4:${personalNumber}:${turnoPerfil?.fechaJornada || hoyISO(ahora)}`;

  useEffect(() => {
    let activo = true;
    const cargar = async () => {
      setLoading(true); setError("");
      if (perfilLoading) return;
      if (!perfilSap) {
        setEmployee(null); setRecords([]);
        setError(perfilError || "No encontramos tu perfil. Vuelve a Recursos Humanos e inténtalo otra vez.");
        setLoading(false); return;
      }
      try {
        if (!personalNumber) throw Error("No encontramos tu número de nómina. Comunícate con Recursos Humanos.");
        const empleado = perfilSap;
        const [raw, modeRaw] = await Promise.all([
          AsyncStorage.getItem(storageKey), AsyncStorage.getItem(modalidadKey),
        ]);
        if (!activo) return;
        if (!empleado || norm(empleado.personalNumber) !== personalNumber) {
          throw Error("No pudimos verificar los datos del empleado.");
        }
        if (!mailOK(correo)) throw Error("No pudimos comprobar el correo de tu cuenta. Vuelve a iniciar sesión.");
        if (empleado.email && empleado.email.toLowerCase() !== correo.toLowerCase()) {
          throw Error("El correo de tu cuenta no coincide con el registro de empleado.");
        }
        const parsed = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(parsed)) throw Error("No se pudieron recuperar los registros anteriores. Contacta a Recursos Humanos.");
        setRecords(parsed.filter(r => r && typeof r === "object" && norm(r.personalNumber) === personalNumber));
        setEmployee(empleado);
        // Prioridad: 1) modalidad de una marcación realmente iniciada hoy;
        // 2) selección guardada previamente para HOY;
        // 3) sindicalizado -> Presencial fija;
        // 4) confianza -> sin seleccionar (bloquear P10 hasta guardar).
        const instanteCarga = new Date();
        const turnoCarga = obtenerTurnoDelDia(empleado.scheduleDetail, instanteCarga);
        const registradosHoy = registrosDeJornadaRH(
          parsed.filter(r => r && r.demo !== true && norm(r.personalNumber) === personalNumber),
          turnoCarga, instanteCarga
        ).filter(r => ["accepted", "sending", "uncertain"].includes(r.sapState));
        const previas = registradosHoy.filter(r => ["entrada", "comida_inicio", "comida_fin", "salida"].includes(r.type));
        const modalidadesRegistradas = [...new Set(previas.map(r =>
          r.modality || ({ PR: "Presencial", HO: "HomeOffice", VN: "Viaje de negocios" }[r.typeSession]) || "").filter(Boolean))];
        const mode = modeRaw ? JSON.parse(modeRaw) : null;
        const permitido = modalidadesPermitidasRH(empleado);
        const grupo = clasificarEmpleadoRH(empleado);
        let actual = null;
        let sinDatos = false;
        if (modalidadesRegistradas.length > 1) {
          sinDatos = true; // Diferencias históricas: evitar nuevos POST hasta revisión.
        } else if (modalidadesRegistradas.length === 1) {
          actual = modalidadesRegistradas[0];
        } else if (previas.length > 0) {
          if (mode?.modalidad) actual = mode.modalidad;
          else sinDatos = true; // No inferir modalidad de una marcación antigua.
        } else if (mode?.modalidad) {
          actual = mode.modalidad;
        } else if (grupo.sindicalizado && !grupo.relacion?.viaje) {
          actual = grupo.relacion?.homeOffice ? "HomeOffice" : "Presencial";
        }
        if (actual && !permitido.includes(actual)) {
          if (previas.length > 0) sinDatos = true; // Registro previo incompatible: requiere revisión.
          else actual = null; // Selección vieja: permitir elegir la modalidad SAP actual.
        }
        // Un estatus 02 habilitado sustituye la modalidad vieja PR de un
        // sindicalizado que todavía no tiene movimientos en esta jornada.
        if (!actual && grupo.sindicalizado && grupo.relacion?.homeOffice && !sinDatos) {
          actual = "HomeOffice";
        }
        setBloqueoModalidadSinDatos(sinDatos);
        setModalidad(actual && permitido.includes(actual) ? actual : (permitido[0] || "Presencial"));
        setModalidadGuardada(!sinDatos && actual && permitido.includes(actual) ? actual : null);
        setViajeDesde(mode?.desde || ""); setViajeHasta(mode?.hasta || "");
        setExtraOpen(!actual && (grupo.confianza || grupo.relacion?.viaje));
      } catch (e) {
        if (activo) {
          const message = String(e?.message || "");
          setError(/SAP|QAS|EmployeeSet|AsyncStorage|ScheduleDetail|HTTP/i.test(message)
            ? "No pudimos cargar tu información. Intenta de nuevo o consulta con Recursos Humanos."
            : message || "No pudimos cargar tu asistencia.");
        }
      }
      finally { if (activo) setLoading(false); }
    };
    cargar();
    return () => { activo = false; };
  }, [personalNumber, correo, storageKey, modalidadKey, refresh, perfilSap, perfilLoading, perfilError]);

  useEffect(() => {
    const timer = setInterval(() => setAhora(new Date()), 15000);
    return () => clearInterval(timer);
  }, []);

  // Si el teléfono vuelve del segundo plano, el historial puede haber cambiado
  // desde otra sesión o desde el monitor BTP.
  useEffect(() => {
    let anterior = AppState.currentState;
    const subscription = AppState.addEventListener("change", siguiente => {
      if ((anterior === "inactive" || anterior === "background") && siguiente === "active"
          && !busyRef.current) {
        setAhora(new Date());
        // obtenerEstadoSAP vuelve a leer EmployeeSet e historial; evita resetear
        // el provider mientras el usuario esta en la pantalla de asistencia.
        setSyncTick(n => n + 1);
      }
      anterior = siguiente;
    });
    return () => subscription.remove();
  }, []);

  const today = hoyISO(ahora);
  const activos = useMemo(() => records.filter(r => r.demo !== true), [records]);
  const empleadoVigente = estadoSAP.perfil || employee;
  const policy = empleadoVigente ? clasificarEmpleadoRH(empleadoVigente) : null;
  const turno = empleadoVigente ? obtenerTurnoDelDia(empleadoVigente.scheduleDetail, ahora) : null;
  const fechaJornada = turno?.fechaJornada || today;

  // Cargar el historial precargado al iniciar sesion. El motor de captura
  // vuelve a validarlo de forma independiente al guardar cada movimiento.
  useEffect(() => {
    let activo = true;
    const identidad = `${personalNumber}|${correo.toLowerCase()}`;
    if (sinConexion !== true || !personalNumber || !mailOK(correo) || perfilLoading) {
      setHistorialOffline({ identidad: "", fechaJornada: "", jornadas: [],
        guardadoEn: 0, cargando: false, error: "" });
      return () => { activo = false; };
    }
    setHistorialOffline({ identidad, fechaJornada, jornadas: [],
      guardadoEn: 0, cargando: true, error: "" });
    const mes = mesLaboralRH(fechaJornada);
    leerHistorialRHCache({ personalNumber: numeroRegistro, email: correo,
      desde: mes.desde, hasta: mes.hasta })
      .then(copia => {
        if (!activo) return;
        setHistorialOffline({ identidad, fechaJornada,
          jornadas: Array.isArray(copia?.jornadas) ? copia.jornadas : [],
          guardadoEn: Number(copia?.guardadoEn || 0), cargando: false,
          error: copia ? "" : "No se encontro una copia mensual de SAP para esta jornada." });
      })
      .catch(err => {
        if (!activo) return;
        if (__DEV__) console.warn("[RRHH][OFFLINE] Consulta jornada local:", err?.message || err);
        setHistorialOffline({ identidad, fechaJornada, jornadas: [],
          guardadoEn: 0, cargando: false, error: "No se pudo leer el historial guardado." });
      });
    return () => { activo = false; };
  }, [sinConexion, personalNumber, numeroRegistro, correo, perfilLoading, fechaJornada]);

  const historialLocalVigente = sinConexion === true && !historialOffline.cargando &&
    historialOffline.identidad === `${personalNumber}|${correo.toLowerCase()}` &&
    historialOffline.fechaJornada === fechaJornada && !!historialOffline.guardadoEn;
  const jornadaCache = historialLocalVigente
    ? historialOffline.jornadas.find(j => j.date === fechaJornada) || null : null;
  // Se lee también online para conservar el bloqueo de un 4.º retardo
  // capturado offline aun después de borrar su fila al sincronizar.
  useEffect(() => {
    let activo = true;
    const identidad = `${personalNumber}|${correo.toLowerCase()}`;
    if (!personalNumber || !mailOK(correo) || !/^\d{4}-\d{2}-\d{2}$/.test(fechaJornada)) {
      setRetardosOffline({ identidad, fechaJornada, totalDelays: null,
        totalAbsences: null, vigente: false, cargando: false, cuartoLocal: false });
      return;
    }
    setRetardosOffline(anterior => ({ ...anterior, identidad, fechaJornada, cargando: true }));
    Promise.all([
      leerRetardosRHCache({ personalNumber, email: correo, fechaJornada }),
      leerCuartoRetardoRH({ personalNumber, email: correo, fechaJornada }),
    ]).then(([conteo, bloqueo]) => {
      if (!activo) return;
      setRetardosOffline({ identidad, fechaJornada,
        totalDelays: conteo?.totalDelays ?? null,
        totalAbsences: conteo?.totalAbsences ?? null,
        vigente: conteo?.vigente === true,
        cargando: false, cuartoLocal: !!bloqueo });
    }).catch(error => {
      if (!activo) return;
      if (__DEV__) console.warn("[RRHH][RETARDOS] No se pudo leer cache local:", error?.message);
      setRetardosOffline({ identidad, fechaJornada, totalDelays: null,
        totalAbsences: null, vigente: false, cargando: false, cuartoLocal: false });
    });
    return () => { activo = false; };
  }, [personalNumber, correo, fechaJornada, revisionColaRH, sinConexion]);
  const retardosDeEstaJornada = retardosOffline.identidad === `${personalNumber}|${correo.toLowerCase()}` &&
    retardosOffline.fechaJornada === fechaJornada;
  // Fallback: si Android se cerró entre guardar P10 y crear el bloqueo local,
  // la propia cola protegida también prueba que ya existe la entrada del 4.º.
  const cuartoEnCola = retardosDeEstaJornada && retardosOffline.vigente &&
    retardosOffline.totalDelays % 4 === 3 && !!turno?.valido &&
    pendientesOffline.some(f => f.fechaJornada === fechaJornada && f.tipo === "P10" &&
      Number.isFinite(Date.parse(`${f.fechaMarcacion}T${f.horaMarcacion}`)) &&
      Date.parse(`${f.fechaMarcacion}T${f.horaMarcacion}`) > turno.inicioMs + 10 * 60000);
  const cuartoLocalDia = retardosDeEstaJornada && (retardosOffline.cuartoLocal || cuartoEnCola);

  // Historial mensual: jornada, estatus y cuota de Home Office.
  // El conteo de retardos proviene EXCLUSIVAMENTE de ProcessingDelaysSet.
  // Si toda la semana cabe en el mes, no se repite la petición.
  const obtenerEstadoSAP = useCallback(async (instante = new Date()) => {
    if (!personalNumber || !mailOK(correo)) throw Error("Identidad no disponible para validar SAP.");
    const perfil = await obtenerEmpleadoRH(correo);
    if (!perfil || norm(perfil.personalNumber) !== personalNumber ||
        String(perfil.email || "").toLowerCase() !== correo.toLowerCase()) {
      throw Error("SAP no pudo confirmar tu perfil. Comunícate con Recursos Humanos.");
    }
    const turnoActual = obtenerTurnoDelDia(perfil.scheduleDetail, instante);
    const fecha = turnoActual?.fechaJornada || hoyISO(instante);
    const mes = mesLaboralRH(fecha);
    const semana = semanaLaboralRH(fecha);
    // Siempre consultar el total oficial actualizado antes de habilitar botones.
    // Sin una respuesta valida no se regresa al conteo antiguo por DayStatus.
    const resumenRetardos = await consultarRetardosRH({
      personalNumber: perfil.personalNumber, fechaJornada: fecha,
    });
    try {
      await guardarRetardosRHCache({ personalNumber: perfil.personalNumber,
        email: correo, fechaJornada: fecha, resumen: resumenRetardos });
    } catch (errorCache) {
      // El conteo SAP ya funcionó. Un error SQLite no bloquea online.
      if (__DEV__) console.warn("[RRHH][RETARDOS] No se pudo guardar conteo offline:", errorCache?.message);
    }
    const consultaMes = iniciarConsultaHistorialRH();
    let mesRespuesta = await consultarHistorialRH({ personalNumber: perfil.personalNumber,
      desde: mes.desde, hasta: mes.hasta,
      scheduleDetail: perfil.scheduleDetail });
    // Protección de viaje: hay servicios SAP que devuelven la jornada actual
    // en consulta diaria, pero no traen el P10 en el rango mensual.
    // Solo en RelationJob=04 y si al mes le falta la entrada, consultar el día
    // exacto y conciliar ANTES de permitir cualquier nuevo registro.
    const conHoraSAP = h => /^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(String(h || "")) && h !== "00:00:00";
    const entradaMes = mesRespuesta.jornadas.find(j => j.date === fecha && conHoraSAP(j.p10Time));
    if (esViajeRH(perfil) && !entradaMes) {
      const exacta = await consultarHistorialRH({
        personalNumber: perfil.personalNumber,
        desde: fecha, hasta: fecha, scheduleDetail: perfil.scheduleDetail,
      });
      const jornadaDia = exacta.jornadas.find(j => j.date === fecha) || null;
      if (__DEV__) console.log("[RRHH][VIAJE][CONSULTA-DIA]", {
        huboEntradaMes: false, huboEntradaDia: conHoraSAP(jornadaDia?.p10Time),
      });
      if (jornadaDia) {
        const previa = mesRespuesta.jornadas.find(j => j.date === fecha) || null;
        const preferirHora = (a, b) => conHoraSAP(a) ? a : b;
        const consolidada = previa ? {
          ...previa,
          p10Time: preferirHora(previa.p10Time, jornadaDia.p10Time),
          p15Time: preferirHora(previa.p15Time, jornadaDia.p15Time),
          p25Time: preferirHora(previa.p25Time, jornadaDia.p25Time),
          p20Time: preferirHora(previa.p20Time, jornadaDia.p20Time),
          dayStatus: previa.dayStatus || jornadaDia.dayStatus,
          relationJob: previa.relationJob || jornadaDia.relationJob,
          relationJobDescription: previa.relationJobDescription || jornadaDia.relationJobDescription,
          typeSession: previa.typeSession || jornadaDia.typeSession,
        } : jornadaDia;
        mesRespuesta = { ...mesRespuesta, jornadas: [
          ...mesRespuesta.jornadas.filter(j => j.date !== fecha), consolidada,
        ].sort((a, b) => b.date.localeCompare(a.date)) };
      }
    }
    // El cache offline se actualiza con ESTA misma respuesta SAP (tambien si
    // SAP devuelve la jornada sin salida). Antes solo se actualizaba la pantalla.
    let cacheError = false;
    try {
      await guardarHistorialRHCache({ personalNumber: perfil.personalNumber,
        email: correo, desde: mes.desde, hasta: mes.hasta,
        jornadas: mesRespuesta.jornadas, ticketConsulta: consultaMes });
    } catch (errorCache) {
      cacheError = true;
      if (__DEV__) console.warn("[RRHH][CACHE] No se actualizo copia mensual:", errorCache?.message || errorCache);
    }
    const semanaIncluida = semana.desde >= mes.desde && semana.hasta <= mes.hasta;
    let semanaRespuesta = mesRespuesta;
    if (!semanaIncluida) {
      const consultaSemana = iniciarConsultaHistorialRH();
      semanaRespuesta = await consultarHistorialRH({ personalNumber: perfil.personalNumber,
        desde: semana.desde, hasta: semana.hasta,
        scheduleDetail: perfil.scheduleDetail });
      try {
        await guardarHistorialRHCache({ personalNumber: perfil.personalNumber,
          email: correo, desde: semana.desde, hasta: semana.hasta,
          jornadas: semanaRespuesta.jornadas, ticketConsulta: consultaSemana });
      } catch (errorCache) {
        cacheError = true;
        if (__DEV__) console.warn("[RRHH][CACHE] No se actualizo copia semanal:", errorCache?.message || errorCache);
      }
    }
    const resumen = {
      ...resumirReglasRH({ jornadasMes: mesRespuesta.jornadas,
        jornadasSemana: semanaRespuesta.jornadas, fechaJornada: fecha }),
      // Nunca tomar retardosPrevios desde DayStatus RETARDO.
      retardosPrevios: resumenRetardos.totalDelays,
      totalAbsencesSAP: resumenRetardos.totalAbsences,
    };
    if (__DEV__) console.log("[RRHH][SAP][JORNADA]", {
      fechaJornada: fecha,
      fechaEnHistorial: resumen.jornadaSAP?.date || null,
      entradaSAP: resumen.jornadaSAP?.p10Time || null,
      salidaSAP: resumen.jornadaSAP?.p20Time || null,
      consulta: "AttendanceHistorySet (mes)",
      relacionLaboralHistorial: resumen.jornadaSAP?.relationJob || "",
      estadoDia: resumen.jornadaSAP?.dayStatus || "",
      filasJornada: resumen.jornadaSAP ? 1 : 0,
    });
    return { verificado: true, cargando: false, error: "", perfil,
      jornadasMes: mesRespuesta.jornadas, jornadasSemana: semanaRespuesta.jornadas,
      resumen, fechaJornada: fecha, cacheError };
  }, [personalNumber, correo]);

  useEffect(() => {
    if (!employee || perfilLoading) {
      setActualizandoSAP(false);
      setEstadoSAP({ verificado: false, cargando: true, error: "", perfil: null,
        jornadasMes: [], jornadasSemana: [], resumen: null, fechaJornada: "" });
      return undefined;
    }
    // En ausencia de red no llamar EmployeeSet/AttendanceHistorySet: la pantalla
    // offline valida el cache directamente al capturar y no necesita un GET.
    if (sinConexion === true) {
      setActualizandoSAP(false);
      setEstadoSAP({ verificado: false, cargando: false,
        error: "Sin conexión: las marcaciones quedarán guardadas solo en este dispositivo.",
        perfil: null, jornadasMes: [], jornadasSemana: [], resumen: null,
        fechaJornada: "" });
      return undefined;
    }
    if (sinConexion === null) {
      setActualizandoSAP(false);
      return undefined;
    } // No consultar SAP hasta conocer la red.
    let activo = true;
    // Si ya consultamos esta jornada, conservarla visible mientras SAP responde.
    // Solo la primera consulta muestra el spinner general de la pantalla.
    setActualizandoSAP(true);
    setEstadoSAP(v => {
      const previa = v.verificado && !!v.resumen && v.fechaJornada === fechaJornada &&
        norm(v.perfil?.personalNumber) === personalNumber;
      return previa ? { ...v, cargando: false, error: "" }
        : { ...v, verificado: false, cargando: true, error: "" };
    });
    obtenerEstadoSAP(new Date()).then(estado => {
      if (activo) setEstadoSAP(estado);
    }).catch(() => {
      if (activo) setEstadoSAP(v => ({ ...v, verificado: false, cargando: false,
        error: "No pudimos verificar tus movimientos y reglas con SAP. Actualiza para intentarlo nuevamente." }));
    }).finally(() => { if (activo) setActualizandoSAP(false); });
    return () => { activo = false; };
  }, [employee, perfilLoading, obtenerEstadoSAP, fechaJornada, syncTick, sinConexion]);

  const colaPendienteRH = pendientesOffline.some(r => r.estado !== "confirmado" ||
    !["no_aplica", "confirmado"].includes(r.justificacionEstado));
  const pendientesJornadaRH = pendientesOffline.filter(r => r.fechaJornada === fechaJornada);
  const sapListo = sinConexion === false && estadoSAP.verificado && !estadoSAP.cargando && !perfilLoading &&
    estadoSAP.fechaJornada === fechaJornada && norm(estadoSAP.perfil?.personalNumber) === personalNumber;
  const jornadaRemota = sapListo ? estadoSAP.resumen?.jornadaSAP :
    sinConexion === true ? jornadaCache : null;
  const movimientosRemotos = useMemo(() => {
    if (!jornadaRemota) return [];
    const tieneViaje = esViajeRH(estadoSAP.perfil) || esViajeRH(jornadaRemota) ||
      jornadaRemota.typeSession === "VN";
    return movimientosDesdeHistoryRH(jornadaRemota, turno).map(mov =>
      tieneViaje && mov.type === "entrada"
        ? { ...mov, modality: "Viaje de negocios", typeSession: "VN" }
        : mov);
  }, [jornadaRemota, turno?.inicioMs, turno?.finMs, fechaJornada,
    estadoSAP.perfil?.relationJob]);
  // Tanto online como offline, los pasos VERDES vienen EXCLUSIVAMENTE
  // de AttendanceHistorySet (respuesta actual SAP o su ultima copia SQLite).
  // Los acuses historicos de AsyncStorage y la cola se conservan para auditoria,
  // pero NO agregan horas como si SAP continuara mostrandolas.
  const activosParaVista = useMemo(() => activos.filter(r => r.sapState !== "accepted"), [activos]);
  // Los acuses de la cola no se ocultan solo porque el POST devolvio OK.
  // Un estado "confirmado" de la cola acredita el ACUSE del POST, pero
  // no garantiza que la marcacion ya figure en AttendanceHistorySet.
  // Solamente se oculta la copia local cuando SAP muestra el MISMO tipo,
  // fecha de jornada Y hora. En caso contrario sigue visible en ambar,
  // sin inventar una confirmacion en el historial ni repetir el POST.
  const marcacionesPendientesVisuales = useMemo(() => pendientesOffline
    .filter(f => {
      if (!TIPO_DESDE_CODIGO[f.tipo]) return false;
      if (f.estado !== "confirmado") return true;
      return !movimientosRemotos.some(sap =>
        sap.registerType === f.tipo && sap.jornadaDate === f.fechaJornada &&
        String(sap.registerHour || "") === String(f.horaMarcacion || ""));
    })
    .map(f => ({
      id: `rh-pendiente:${f.id}`, personalNumber, date: f.fechaMarcacion,
      time: String(f.horaMarcacion || "").slice(0, 5), registerHour: f.horaMarcacion,
      jornadaDate: f.fechaJornada, type: TIPO_DESDE_CODIGO[f.tipo], registerType: f.tipo,
      modality: modalidadGuardada || "Presencial",
      typeSession: ({ Presencial: "PR", HomeOffice: "HO", "Viaje de negocios": "VN" })[modalidadGuardada] || "PR",
      source: "RH_OFFLINE", estadoOffline: f.estado, sapState: "offline_pending",
    })), [pendientesOffline, movimientosRemotos, personalNumber, modalidadGuardada]);
  const registrosCombinados = useMemo(() => [
    ...activosParaVista, ...movimientosRemotos, ...marcacionesPendientesVisuales,
  ], [activosParaVista, movimientosRemotos, marcacionesPendientesVisuales]);

  const registrosParaValidar = useMemo(() => registrosCombinados.filter(r =>
    !(["sending", "uncertain", "rejected"].includes(r.sapState) &&
      movimientosRemotos.some(sap => sap.type === r.type))),
    [registrosCombinados, movimientosRemotos]);
  const deHoy = useMemo(() => registrosDeJornadaRH(registrosCombinados, turno, ahora),
    [registrosCombinados, turno?.inicioMs, turno?.finMs, today]);
  const aceptados = useMemo(() => deHoy.filter(r => r.sapState === "accepted"), [deHoy]);
  const pendientes = useMemo(() => deHoy.filter(r => ["sending", "uncertain", "rejected"].includes(r.sapState)), [deHoy]);
  // Si SAP ya confirmó la marcación, no mostrar un acuse local "pendiente" del mismo tipo.
  const pendientesReales = pendientes.filter(p => !movimientosRemotos.some(x => x.type === p.type));
  const pendientesDeHoyVisuales = deHoy.filter(r => r.source === "RH_OFFLINE");
  // Los acuses aceptados que aun NO se reflejan en SAP siguen por conciliar:
  // no deben habilitar una segunda marcacion del mismo movimiento.
  const acusesSinHistorial = pendientesDeHoyVisuales.some(r => r.estadoOffline === "confirmado");
  // No permitir un segundo POST mientras exista un acuse de la misma jornada
  // aceptado por el POST, pero aun ausente de AttendanceHistorySet.
  const bloquearPorColaRH = cargandoColaRH || !!errorColaRH || colaPendienteRH || acusesSinHistorial;
  const pasoVisible = tipo => ultimo(aceptados, tipo) || ultimo(pendientesDeHoyVisuales, tipo);
  // Solo para avance VISUAL de la jornada. El envio y la conciliacion siguen
  // usando la fuente real de cada movimiento; una cola pendiente no es SAP OK.
  const entradaVista = pasoVisible("entrada");
  const inicioComidaVista = pasoVisible("comida_inicio");
  const regresoComidaVista = pasoVisible("comida_fin");
  const salidaVista = pasoVisible("salida");
  const hayPendientesRevisionOffline = pendientesOffline.some(p =>
    ["enviando", "incierto", "revision", "rechazado"].includes(p.estado));
  const entrada = ultimo(aceptados, "entrada");
  const inicioComida = ultimo(aceptados, "comida_inicio");
  const regresoComida = ultimo(aceptados, "comida_fin");
  const salida = ultimo(aceptados, "salida");
  const hayRegistroSAP = !!movimientosRemotos.length;
  const hoyEnHomeOffice = !!(sapListo && (estadoSAP.resumen?.homeOfficeHoy ||
    esHomeOfficeEmpleadoRH(estadoSAP.perfil)));
  const viajeActivo = !!(sapListo && (esViajeRH(estadoSAP.perfil) ||
    esViajeRH(jornadaRemota) || jornadaRemota?.typeSession === "VN"));
  const viajeYaEnviado = aceptados.some(r => r.type === "entrada" &&
    (r.typeSession === "VN" || r.modality === "Viaje de negocios"));
  const previoTardanzas = sapListo ? estadoSAP.resumen?.retardosPrevios ?? 0 :
    (retardosDeEstaJornada && retardosOffline.vigente ? retardosOffline.totalDelays : 0);
  const plazoRetardo = turno?.valido ? turno.inicioMs + 10 * 60000 : Infinity;
  const siguienteEsCuarto = Number.isSafeInteger(previoTardanzas) &&
    cicloRetardosRH(previoTardanzas).cuartoEnSiguienteEntrada;
  const esCuartoAhora = (sapListo || (sinConexion === true && retardosDeEstaJornada && retardosOffline.vigente)) &&
    !entrada && siguienteEsCuarto && ahora.getTime() > plazoRetardo;
  const entradaFueCuarto = cuartoLocalDia || (!!entrada && (deHoy.some(r => r.type === "entrada" && r.fourthLate) ||
    (siguienteEsCuarto && (() => {
      const fecha = entrada?.date;
      const hora = entrada?.registerHour || entrada?.time;
      if (!fecha || !hora) return false;
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
      if (!m) return false;
      const h = /^([01]\d|2[0-3]):([0-5]\d)/.exec(hora);
      if (!h) return false;
      const instante = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(h[1]), Number(h[2]));
      return instante.getTime() > plazoRetardo;
    })())));
  // Una petición de cuarto retardo incierta también bloquea continuación hasta
  // que SAP/RH determine su resultado: nunca asumir que un timeout = no guardado.
  const cuartoPendienteConfirmar = deHoy.some(r => r.type === "entrada" && r.fourthLate &&
    ["accepted", "sending", "uncertain", "rejected"].includes(r.sapState));
  // El estatus 04 permite la PRIMERA entrada de viaje, pero no más movimientos.
  // Antes se bloqueaba por el simple hecho de tener RelationJob=04.
  const bloqueadaJornadaSAP = cuartoLocalDia || (sapListo && (estadoSAP.resumen?.inasistenciaSAP ||
    (viajeActivo && !!entrada) || viajeYaEnviado || entradaFueCuarto || cuartoPendienteConfirmar));
  const cuotaHOUsada = !!(sapListo && estadoSAP.resumen?.homeOfficeUsadoSemana);
  const modalidades = empleadoVigente ? modalidadesPermitidasRH(empleadoVigente) : ["Presencial"];
  const modalidadConfirmadaLocal = aceptados.find(x => x.modality && x.source !== "SAP")?.modality;
  const modalidadRegistrada = hoyEnHomeOffice ? "HomeOffice" :
    viajeActivo && hayRegistroSAP ? "Viaje de negocios" :
    (modalidadConfirmadaLocal || (hayRegistroSAP ? "Presencial" : null));
  // El cuarto retardo se procesa como una entrada presencial simple, sin selección
  // de modalidad ni solicitud de justificación en la app.
  const modalidadEfectiva = esCuartoAhora ? "Presencial" :
    (hoyEnHomeOffice ? "HomeOffice" :
      (policy?.sindicalizado && policy?.relacion?.homeOffice ? "HomeOffice" :
        (entrada ? (modalidadRegistrada || modalidadGuardada) : modalidadGuardada)));
  const huboEnvioHoy = deHoy.some(r => ["accepted", "sending", "uncertain", "rejected", "offline_pending"].includes(r.sapState) && !!TIPOS_RH[r.type]);
  const modoBloqueado = huboEnvioHoy || busy || esCuartoAhora || bloqueadaJornadaSAP || hoyEnHomeOffice || bloquearPorColaRH;
  const pantallaJornadaDisponible = sapListo || sinConexion === true;
  const requiereElegirModalidad = !!(policy?.confianza || policy?.relacion?.viaje);
  const modalidadLista = sinConexion === true
    ? !!((policy?.sindicalizado && !requiereElegirModalidad) ||
        (modalidadGuardada && modalidades.includes(modalidadGuardada))) &&
      !bloqueoModalidadSinDatos
    : (esCuartoAhora || (!!modalidadEfectiva && !bloqueoModalidadSinDatos &&
      !(modalidadEfectiva === "HomeOffice" && cuotaHOUsada && !entrada))) &&
      sapListo && !bloqueadaJornadaSAP;

  const persistir = useCallback(async nuevos => {
    await AsyncStorage.setItem(storageKey, JSON.stringify(nuevos));
    setRecords(nuevos);
  }, [storageKey]);
  const revisar = tipo => {
    if (sinConexion === true) {
      if (cuartoLocalDia) return { permitido: false,
        mensaje: "Se registró el cuarto retardo del ciclo. Solo se permite la entrada; los demás checks están bloqueados por inasistencia." };
      if (!retardosDeEstaJornada || retardosOffline.cargando || !retardosOffline.vigente) {
        return { permitido: false,
          mensaje: "No hay un total mensual vigente de ProcessingDelaysSet. Conéctate para preparar los retardos antes de registrar offline." };
      }
      if (cargandoColaRH || errorColaRH || historialOffline.cargando) {
        return { permitido: false, mensaje: "Comprobando la informacion guardada de RRHH." };
      }
      if (!historialLocalVigente) return { permitido: false,
        mensaje: "No hay historial mensual guardado para esta jornada. Conectate para actualizar la copia SAP." };
      if (Date.now() - historialOffline.guardadoEn > 24 * 60 * 60 * 1000) {
        return { permitido: false, mensaje: "La informacion guardada tiene mas de 24 horas. Debe actualizarse en SAP." };
      }
      if (hayPendientesRevisionOffline || pendientesReales.length) {
        return { permitido: false, mensaje: "Existe una marcacion por revisar antes de continuar." };
      }
      if (!modalidadLista) return { permitido: false,
        mensaje: "Confirma primero la modalidad de trabajo para la jornada." };
      if (modalidadEfectiva !== "Presencial" && modalidadEfectiva !== "HomeOffice" &&
          modalidadEfectiva !== "Viaje de negocios") return { permitido: false,
        mensaje: "Modalidad no valida para captura sin internet." };
      if (esViajeRH(empleadoVigente) && modalidadEfectiva !== "Viaje de negocios") return {
        permitido: false, mensaje: "El perfil guardado requiere modalidad Viaje de negocios." };
      if (esHomeOfficeEmpleadoRH(empleadoVigente) && modalidadEfectiva !== "HomeOffice") return {
        permitido: false, mensaje: "El perfil guardado requiere modalidad Home Office." };
      const resumenLocal = resumirReglasRH({ jornadasMes: historialOffline.jornadas,
        jornadasSemana: historialOffline.jornadas, fechaJornada });
      if (resumenLocal.inasistenciaSAP ||
          (resumenLocal.homeOfficeHoy && modalidadEfectiva !== "HomeOffice")) {
        return { permitido: false, mensaje: "La jornada guardada tiene un estado especial; requiere revision SAP." };
      }
      // Para validar la secuencia, las capturas pendientes cuentan como pasos
      // locales previos. Solo el servicio de captura decide si se pueden guardar.
      const secuenciaLocal = marcacionesPendientesVisuales
        .filter(r => r.estadoOffline === "pendiente")
        .map(r => ({ ...r, sapState: "accepted" }));
      const registrosEvaluados = [...activosParaVista, ...movimientosRemotos,
        ...secuenciaLocal];
      // Rechazar marcaciones cronologicamente anteriores a la entrada, incluso
      // cuando se modifica la hora del emulador. Turnos nocturnos usan fecha real.
      if (tipo !== "entrada" && registrosEvaluados.some(r =>
        r.type === "entrada" && (fechaHoraRegistroRH(r) || 0) > ahora.getTime())) {
        return { permitido: false,
          mensaje: "La hora del equipo es anterior a tu entrada. Para turnos nocturnos avanza tambien la fecha del emulador al dia siguiente." };
      }
      return evaluarMarcacionRH({ empleado: empleadoVigente, tipo,
        registros: registrosEvaluados, ahora, modalidad: modalidadEfectiva });
    }
    if (!sapListo) return { permitido: false, mensaje: estadoSAP.error || "Primero necesitamos verificar tus registros en SAP." };
    if (bloqueadaJornadaSAP) return { permitido: false,
      mensaje: viajeActivo || viajeYaEnviado ? "Tienes viaje de negocios registrado. No necesitas realizar más marcaciones." :
        "Tu jornada ya fue clasificada como inasistencia o cuarto retardo. No se admiten más marcaciones." };
    if (modalidadEfectiva === "HomeOffice" && cuotaHOUsada && !entrada) return { permitido: false,
      mensaje: "Ya utilizaste Home Office esta semana. Elige otra modalidad." };
    return evaluarMarcacionRH({ empleado: empleadoVigente, tipo,
      registros: registrosParaValidar, ahora, modalidad: modalidadEfectiva });
  };
  const elegirFechaViaje = (evento, fecha) => {
    if (Platform.OS === "android") setViajePicker(null);
    if (evento?.type === "dismissed" || !fecha) return;
    const elegida = hoyISO(fecha);
    setModalidadGuardada(null);
    if (viajePicker === "desde") {
      setViajeDesde(elegida);
      if (viajeHasta && elegida > viajeHasta) setViajeHasta("");
    } else if (viajePicker === "hasta") {
      if (viajeDesde && elegida < viajeDesde) {
        Alert.alert("Revisa las fechas", "El fin del viaje no puede ser anterior al inicio.");
        return;
      }
      setViajeHasta(elegida);
    }
  };
  // Los acuses online se conservan para poder reintentar SOLO su justificacion,
  // aunque no vuelvan a pintar pasos verdes en la linea de jornada.
  // Solo habilitarla si el movimiento sigue apareciendo en SAP.
  const justificacionesSinConfirmar = registrosDeJornadaRH(activos, turno, ahora)
    .filter(r => r.source !== "SAP" && r.source !== "RH_SYNC_CONFIRMED" &&
      r.sapState === "accepted" && r.needsJustification &&
      r.justificationState !== "accepted" &&
      (!sapListo || movimientosRemotos.some(sap => sap.type === r.type)));

  // Confirmacion LOCAL y explicita de la modalidad Presencial para personal
  // de confianza. El motor offline aun no admite HO ni viajes de negocios.
  // Opcion manual complementaria al agente automatico: siempre verifica SAP primero.
  const sincronizarColaAhora = async () => {
    if (sinConexion !== false || busyRef.current || cargandoColaRH || !!errorColaRH) return;
    busyRef.current = true;
    setBusy(true);
    setSincronizandoRH(true);
    setMensajeSync("");
    try {
      const resultado = await sincronizarPendientesRH({
        personalNumber: numeroRegistro, email: correo, ensureValidToken,
      });
      // Una sola recarga de la cola, sin vaciar temporalmente sus tarjetas.
      setRevisionColaRH(n => n + 1);
      if (resultado.reason === "en_curso") {
        setMensajeSync("Ya se están sincronizando tus registros.");
        return;
      }
      // Refrescar la fuente de verdad SIN incrementar syncTick: eso activaba
      // una segunda consulta y ocultaba los pasos de la jornada.
      if (resultado.ok || resultado.confirmados > 0) {
        try {
          const estadoNuevo = await obtenerEstadoSAP(new Date());
          setEstadoSAP(estadoNuevo);
        } catch (e) {
          if (__DEV__) console.warn("[RRHH][SYNC] Consulta posterior:", e?.message || e);
          setMensajeSync("Envío revisado. No se pudo actualizar el historial SAP.");
          return;
        }
      }
      setMensajeSync(resultado.ok && resultado.restantes === 0
        ? "Sincronización finalizada."
        : "Hay registros pendientes de revisión. Se conservaron sus datos.");
    } catch (e) {
      if (__DEV__) console.warn("[RRHH][SYNC] Error:", e?.message || e);
      setMensajeSync("No se completó la sincronización. Tus registros siguen guardados.");
      setRevisionColaRH(n => n + 1);
    } finally {
      busyRef.current = false;
      setBusy(false);
      setSincronizandoRH(false);
    }
  };

  // Revisar en SAP ANTES de decidir si reenviar un comprobante local.
  // No vuelve a pedir GPS, fecha, hora ni justificacion al empleado.
  const ejecutarReenvioOffline = async (id, soloJustificacion = false) => {
    if (sinConexion !== false || busyRef.current || cargandoColaRH || errorColaRH) return;
    busyRef.current = true; setBusy(true);
    try {
      const parametros = { personalNumber: numeroRegistro, email: correo, id, ensureValidToken };
      const respuesta = soloJustificacion
        ? await autorizarReenvioJustificacionGuardadaRH({
            ...parametros, confirmadaAusenciaConRH: true,
          })
        : await autorizarReenvioMarcacionGuardadaRH({
            ...parametros, autorizacionExplicita: true,
          });
      setRevisionColaRH(n => n + 1);
      if (!respuesta.reenvio) {
        setSyncTick(n => n + 1);
        Alert.alert("Registro encontrado", "SAP ya tiene esa marcación. No se volvió a enviar.");
        return;
      }
      // El motor siempre extrae el JSON ORIGINAL de SecureStore. Nunca se
      // fabrica otro comprobante con la hora actual ni nuevas coordenadas.
      const resultado = await sincronizarPendientesRH({
        personalNumber: numeroRegistro, email: correo, ensureValidToken,
      });
      setRevisionColaRH(n => n + 1);
      setSyncTick(n => n + 1);
      Alert.alert("Reenvío del comprobante guardado", resultado.reason === "en_curso"
        ? "La sincronización ya está en curso. Consulta el estado en unos momentos."
        : resultado.ok && resultado.restantes === 0
          ? "SAP confirmó los registros y las justificaciones pendientes."
          : `Se conservó el registro original. Estado: ${resultado.reason || "pendiente"}.` +
            (resultado.detail ? `\n${resultado.detail}` : "") +
            "\nPuedes volver a verificar el estado aquí.");
    } catch (e) {
      setRevisionColaRH(n => n + 1);
      Alert.alert("No se pudo preparar el reenvío", String(e?.message || e).slice(0, 550));
    } finally { busyRef.current = false; setBusy(false); }
  };

  const verificarAntesDeReenviarOffline = async fila => {
    if (sinConexion !== false || busyRef.current || cargandoColaRH || errorColaRH) return;
    busyRef.current = true; setBusy(true);
    try {
      const v = await verificarMarcacionGuardadaRH({
        personalNumber: numeroRegistro, email: correo, id: fila.id, ensureValidToken,
      });
      setRevisionColaRH(n => n + 1);
      if (v.resultado === "encontrado") {
        setSyncTick(n => n + 1);
        Alert.alert("Marcación encontrada en SAP",
          "La marcación original ya está registrada. Se conservó como confirmada sin hacer otro POST.");
      } else if (v.resultado === "conflicto") {
        Alert.alert("Diferencia con SAP",
          `SAP registra este tipo de movimiento a las ${v.horaSAP}. ` +
          `Tu comprobante original tiene ${fila.horaMarcacion}. ` +
          "No es seguro reenviar: solicita una revisión de Recursos Humanos.");
      } else if (v.resultado === "enviando") {
        Alert.alert("Envío en curso", "Espera a que finalice la petición antes de verificarla.");
      } else {
        // Un GET sin movimiento no garantiza que ABAP no lo haya recibido;
        // SOLO el empleado autoriza explícitamente repetir el MISMO POST.
        Alert.alert("No aparece en el historial SAP",
          `${fila.tipo} del ${fila.fechaMarcacion} a las ${fila.horaMarcacion}.\n\n` +
          "La ausencia en el historial NO garantiza que SAP no haya recibido el envío anterior. " +
          "Si Recursos Humanos confirmó que no existe, puedes reenviar exactamente el registro guardado, " +
          "sin tomar otra foto, hora ni ubicación. ¿Autorizar el reenvío?", [
            { text: "Cancelar", style: "cancel" },
            { text: "Reenviar original", onPress: () => ejecutarReenvioOffline(fila.id) },
          ]);
      }
    } catch (e) {
      Alert.alert("No se pudo verificar en SAP", String(e?.message || e).slice(0, 550) +
        "\nNo se reenviará hasta poder consultar SAP.");
    } finally { busyRef.current = false; setBusy(false); }
  };

  const verErroresAnterioresOffline = async fila => {
    try {
      const eventos = await leerBitacoraMarcacionRH({
        personalNumber: numeroRegistro, email: correo, id: fila.id,
      });
      const fallos = eventos.filter(e => !!e.detalle ||
        ["rechazado", "incierto", "revision"].includes(e.estadoNuevo));
      const texto = fallos.slice(0, 8).map(e => {
        const fecha = new Date(Number(e.fechaEvento)).toLocaleString("es-MX");
        return `${fecha} · ${e.etapa}: ${e.estadoNuevo}\n${e.detalle || "Sin detalle adicional"}`;
      }).join("\n\n");
      Alert.alert("Historial de intentos y errores", texto ||
        (fila.ultimoError || fila.justificacionError || "Todavía no hay errores registrados."));
    } catch (e) {
      Alert.alert("Bitácora no disponible", String(e?.message || e).slice(0, 300));
    }
  };

  const confirmarReenvioJustificacionOffline = fila => {
    Alert.alert("Revisar justificación con RH",
      `Marcación ${fila.tipo} del ${fila.fechaMarcacion} a las ${fila.horaMarcacion}.\n\n` +
      "AttendanceHistorySet no confirma si JustificationLogSet recibió una justificación. " +
      "Verifica primero en SAP/RH que esa justificación no exista. " +
      "¿RH te confirmó que NO fue recibida y autorizas reenviar SOLO la justificación original?", [
        { text: "Cancelar", style: "cancel" },
        { text: "Confirmo y reenvío", onPress: () => ejecutarReenvioOffline(fila.id, true) },
      ]);
  };

  const guardarPresencialOffline = async () => {
    if (sinConexion !== true || !employee || !policy?.confianza ||
        busyRef.current || bloqueoModalidadSinDatos || cargandoColaRH || errorColaRH ||
        (modalidadGuardada && modalidadGuardada !== "Presencial")) return;
    try {
      await AsyncStorage.setItem(modalidadKey,
        JSON.stringify({ modalidad: "Presencial", desde: "", hasta: "" }));
      setModalidad("Presencial");
      setModalidadGuardada("Presencial");
      setExtraOpen(false);
      Alert.alert("Modalidad preparada", "Elegiste Presencial para esta jornada. Las marcaciones se guardarán localmente y quedarán pendientes de SAP.");
    } catch (_) {
      Alert.alert("No se pudo guardar modalidad", "Revisa el almacenamiento local antes de continuar.");
    }
  };

  // Solo captura en SQLite RRHH + SecureStore: sin POST, sin reintentos.
  const registrarSinInternet = (tipo, justificacionDatos = null) => {
    if (sinConexion !== true || busyRef.current || cargandoColaRH || errorColaRH) return;
    if (!employee || !policy?.habilitado || bloqueoModalidadSinDatos) return;
    if (requiereElegirModalidad && !modalidadGuardada) {
      Alert.alert("Selecciona modalidad", "Primero confirma tu modalidad de trabajo para esta jornada.");
      return;
    }
    // Una solicitud online que quedo incierta NO se convierte en captura offline.
    if (activos.some(r => ["sending", "uncertain", "rejected"].includes(r.sapState) &&
        registrosDeJornadaRH([r], turno, new Date()).length)) {
      Alert.alert("Marcación por revisar", "Tienes una marcación anterior cuyo resultado requiere verificar SAP. No la repitas sin internet.");
      return;
    }
    const titulo = MAP[tipo]?.title || "Marcación";
    Alert.alert("Guardar sin conexión", `${titulo} se guardará únicamente en este dispositivo. SAP todavía NO recibirá la solicitud; se enviará al recuperar internet y verificar SAP. ¿Confirmas?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Guardar en el teléfono", onPress: async () => {
        if (busyRef.current) return;
        busyRef.current = true;
        setBusy(true);
        try {
          if (!(await ensureValidToken())) {
            throw Error("La sesión local ya no está vigente. Inicia sesión con internet antes de registrar.");
          }
          const salida = await capturarMarcacionOfflineRH({
            empleado: employee,
            personalNumber: numeroRegistro,
            email: correo,
            tipo,
            modalidad: modalidadEfectiva,
            registrosLocales: activos,
            viajeDesde, viajeHasta,
            justificacionDatos,
          });
          // Mostrar el contenido real de la cola; no asumir éxito si no se leyó.
          setRevisionColaRH(n => n + 1);
          setDialog(null);
          Alert.alert(salida.yaExistia ? "Registro ya guardado" : "Guardado en el teléfono",
            salida.aviso + "\n\nNo desinstales la aplicación ni borres sus datos hasta que Recursos Humanos confirme el registro.");
        } catch (err) {
          Alert.alert("No se pudo guardar", String(err?.message || "Revisa la conexión, el GPS y los datos offline.").slice(0, 400));
        } finally {
          busyRef.current = false;
          setBusy(false);
        }
      } },
    ]);
  };

  const bloquearColaRHParaModalidad = () =>
    cargandoColaRH || !!errorColaRH || hayPendientesRevisionOffline || colaPendienteRH;
  const guardarModalidad = async () => {
    if (sinConexion === true) {
      if (!employee || !requiereElegirModalidad || busyRef.current || bloquearColaRHParaModalidad()) return;
      if (!modalidades.includes(modalidad)) {
        Alert.alert("Modalidad no disponible", "Esta modalidad no corresponde al empleado."); return;
      }
      if (modalidad === "HomeOffice" && esViajeRH(employee)) {
        Alert.alert("Modalidad", "El perfil guardado indica viaje, no Home Office."); return;
      }
      if (modalidad === "Viaje de negocios" &&
          (!/^\d{4}-\d{2}-\d{2}$/.test(viajeDesde) ||
           !/^\d{4}-\d{2}-\d{2}$/.test(viajeHasta) ||
           viajeDesde > viajeHasta || fechaJornada < viajeDesde || fechaJornada > viajeHasta)) {
        Alert.alert("Fechas del viaje", "Selecciona fechas validas que incluyan la jornada."); return;
      }
      try {
        await AsyncStorage.setItem(modalidadKey, JSON.stringify({ modalidad, desde: viajeDesde, hasta: viajeHasta }));
        setModalidadGuardada(modalidad); setExtraOpen(false);
        Alert.alert("Modalidad guardada", "Tus marcaciones quedaran pendientes hasta que SAP las confirme.");
      } catch (_) { Alert.alert("Error", "No se pudo guardar la modalidad local."); }
      return;
    }
    if (!employee || !sapListo || busyRef.current || modoBloqueado || bloqueoModalidadSinDatos || !requiereElegirModalidad || bloquearPorColaRH) return;
    if (modalidad === "HomeOffice" && cuotaHOUsada) {
      Alert.alert("Home Office no disponible", "Ya existe un registro de Home Office en esta semana. Solo puedes usar esta modalidad una vez por semana.");
      return;
    }
    if (!modalidades.includes(modalidad)) { Alert.alert("Modalidad no permitida", "No corresponde al grupo de personal."); return; }
    try { codigoModalidadRH(modalidad); }
    catch (e) { Alert.alert("Modalidad no disponible", "No pudimos confirmar esta opción. Comunícate con Recursos Humanos."); return; }
    if (modalidad === "Viaje de negocios") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(viajeDesde) || !/^\d{4}-\d{2}-\d{2}$/.test(viajeHasta)
        || viajeDesde > viajeHasta || fechaJornada < viajeDesde || fechaJornada > viajeHasta) {
        Alert.alert("Fechas del viaje", "Captura un período AAAA-MM-DD que incluya el día de hoy."); return;
      }
    }
    try {
      await AsyncStorage.setItem(modalidadKey, JSON.stringify({ modalidad, desde: viajeDesde, hasta: viajeHasta }));
      setModalidadGuardada(modalidad);
      setExtraOpen(false);
      Alert.alert("Modalidad guardada", `Hoy trabajarás en modalidad ${modalidad}. No podrás cambiarla después de registrar tu entrada.`);
    } catch (e) { Alert.alert("Error al guardar", e?.message || "No se pudo guardar la modalidad."); }
  };
  const abrir = tipo => {
    if (busyRef.current || !policy?.habilitado || (sinConexion !== true && (!sapListo || bloqueadaJornadaSAP))) return;
    if (sinConexion !== true && bloquearPorColaRH) {
      Alert.alert("Pendientes de RRHH", "Primero hay que conciliar las marcaciones guardadas en este teléfono antes de enviar una nueva a SAP.");
      return;
    }
    if (!modalidadLista) {
      Alert.alert("Falta seleccionar modalidad", "Guarda primero la modalidad antes de registrar la entrada.");
      setExtraOpen(true);
      return;
    }
    const resultado = revisar(tipo);
    if (!resultado.permitido) {
      const mensaje = /SAP|ScheduleDetail|TypeSession|ABAP/i.test(resultado.mensaje || "")
        ? "Este registro requiere revisión. Comunícate con Recursos Humanos."
        : resultado.mensaje;
      Alert.alert("Registro no disponible", mensaje); return;
    }
    setMotivo("Laboral"); setComentario(""); setRecuperarTiempo(false);
    setDialog({ tipo, offline: sinConexion === true, aviso: esCuartoAhora ?
      "Este sería el cuarto retardo de tu ciclo mensual. Se enviará únicamente la entrada; los demás checks quedarán bloqueados por inasistencia." : resultado.aviso,
      late: !esCuartoAhora && !!resultado.retardo,
      early: !esCuartoAhora && !!resultado.salidaAnticipada,
      fourth: !!esCuartoAhora });
  };
  // Doble comprobación: antes del GPS y justo antes del POST.
  // Evita que otra sesión/canal avance la jornada durante la preparación del envío.
  const validarMarcacionActualSAP = async (tipo, modalidadDeseada) => {
    const estado = await obtenerEstadoSAP(new Date());
    setEstadoSAP(estado);
    const grupoActual = clasificarEmpleadoRH(estado.perfil);
    if (!grupoActual.habilitado) throw Error(grupoActual.razon);
    // Un empleado con RelationJob=04 puede registrar P10 en modalidad VN.
    // La duplicidad y cualquier movimiento posterior se bloquean con el historial actualizado.
    if (esViajeRH(estado.perfil) && (tipo !== "entrada" || modalidadDeseada !== "Viaje de negocios")) {
      throw Error("Tu estatus es VIAJE DE NEGOCIOS. Únicamente puedes realizar la entrada inicial en esa modalidad.");
    }
    if (estado.resumen.inasistenciaSAP) throw Error("SAP ya clasificó esta jornada como inasistencia.");
    const turn = obtenerTurnoDelDia(estado.perfil.scheduleDetail, new Date());
    const remotos = movimientosDesdeHistoryRH(estado.resumen.jornadaSAP, turn);
    // Revalidacion previa al POST: se usa lo que SAP devuelve AHORA.
    // Un recibo historico 'accepted' en AsyncStorage no sustituye al GET
    // (por ejemplo si la marcacion fue eliminada en SAP QAS).
    const combinados = [
      ...activos.filter(r => r.sapState !== "accepted"), ...remotos,
    ].filter(r => !(
      ["sending", "uncertain", "rejected"].includes(r.sapState) &&
      remotos.some(x => x.type === r.type)));
    const marcacionEntrada = combinados.find(r => r.type === "entrada" && r.sapState === "accepted" &&
      registrosDeJornadaRH([r], turn, new Date()).length > 0);
    // RelationJob=04 puede venir en EmployeeSet o en AttendanceHistorySet,
    // incluso si DayStatus dice PRESENTE. No enviar otro P10 una vez que SAP
    // ya muestra entrada ni habilitar P15/P25/P20 durante viaje de negocios.
    const viajeEnSAP = esViajeRH(estado.perfil) ||
      esViajeRH(estado.resumen.jornadaSAP) || estado.resumen.jornadaSAP?.typeSession === "VN";
    const localViaje = combinados.some(r => r.type === "entrada" && r.sapState === "accepted" &&
      (r.typeSession === "VN" || r.modality === "Viaje de negocios"));
    if (marcacionEntrada && (viajeEnSAP || localViaje)) {
      throw Error("SAP ya confirmó la entrada de VIAJE DE NEGOCIOS. No se permiten nuevas marcaciones en esta jornada.");
    }
    if (localViaje) throw Error("Ya registraste tu viaje de negocios. No debes realizar más marcaciones.");
    const cuarto = tipo === "entrada" && !marcacionEntrada &&
      cicloRetardosRH(estado.resumen.retardosPrevios).cuartoEnSiguienteEntrada &&
      turn?.valido && Date.now() > turn.inicioMs + 10 * 60000;
    const modalidadActual = cuarto ? "Presencial" :
      (esHomeOfficeEmpleadoRH(estado.perfil) || estado.resumen.homeOfficeHoy ? "HomeOffice" : modalidadDeseada);
    if (modalidadActual === "HomeOffice" && !marcacionEntrada && estado.resumen.homeOfficeUsadoSemana) {
      throw Error("Ya registraste Home Office esta semana. Selecciona una modalidad diferente.");
    }
    const evaluacion = evaluarMarcacionRH({ empleado: estado.perfil,
      tipo, registros: combinados, ahora: new Date(), modalidad: modalidadActual });
    if (!evaluacion.permitido) throw Error(evaluacion.mensaje);
    // Si el cuarto retardo se registró desde otro dispositivo, no autorizar comida ni salida.
    if (tipo !== "entrada" &&
        (cuartoLocalDia || cicloRetardosRH(estado.resumen.retardosPrevios).cuartoEnSiguienteEntrada) &&
        marcacionEntrada && turn?.valido) {
      const hora = String(marcacionEntrada.registerHour || marcacionEntrada.time || "");
      const momentoEntrada = fechaParaPicker(marcacionEntrada.date);
      const t = /^(\d{1,2}):(\d{2})/.exec(hora);
      if (t) {
        momentoEntrada.setHours(Number(t[1]), Number(t[2]), 0, 0);
        if (momentoEntrada.getTime() > turn.inicioMs + 10 * 60000) {
          throw Error("Se registró el cuarto retardo. No puedes continuar la jornada; Recursos Humanos debe verificar la inasistencia en SAP.");
        }
      }
    }
    return { estado, combinados, modalidadActual, cuarto, evaluacion };
  };

  const registrar = async () => {
    if (!dialog || busyRef.current || !employee || !modalidadLista) return;
    if (sinConexion === true) {
      const resultado = revisar(dialog.tipo);
      if (!resultado.permitido) {
        Alert.alert("Registro no disponible", resultado.mensaje || "Revisa la jornada.");
        return;
      }
      const requiereMotivo = !dialog.fourth && !!(resultado.retardo || resultado.salidaAnticipada);
      if (requiereMotivo && (!comentario.trim() || !["Personal", "Laboral"].includes(motivo))) {
        Alert.alert("Justificacion requerida", "Selecciona motivo y escribe un comentario para guardar el registro offline.");
        return;
      }
      registrarSinInternet(dialog.tipo, requiereMotivo
        ? { motivo, comentario: comentario.trim(), recuperarTiempo }
        : null);
      return;
    }
    if (sinConexion !== false || bloquearPorColaRH) {
      setDialog(null);
      Alert.alert("No se enviará a SAP", "La conexión o la cola local cambió. Revisa las marcaciones pendientes antes de continuar.");
      return;
    }
    busyRef.current = true; setBusy(true);
    const tipo = dialog.tipo;
    let pendiente = null;
    let envioIniciado = false;
    let asistenciaAceptada = false;
    let guardados = records;
    try {
      // Se conserva el rango seleccionado y se envía a SAP en DateTo y DateFrom cuando la modalidad es VN.
      if (modalidadGuardada === "Viaje de negocios" &&
        (fechaJornada < viajeDesde || fechaJornada > viajeHasta)) {
        throw Error("Hoy debe estar incluido en las fechas del viaje seleccionado.");
      }
      const resultado = revisar(tipo);
      if (!resultado.permitido) throw Error(resultado.mensaje);
      const requiereMotivo = !esCuartoAhora && !!(resultado.retardo || resultado.salidaAnticipada);
      if (requiereMotivo !== !!(dialog.late || dialog.early)) {
        setDialog(null);
        Alert.alert("Horario actualizado", "Tu horario cambió mientras confirmabas. Vuelve a elegir el registro.");
        return;
      }
      if (requiereMotivo && (!comentario.trim() || !["Personal", "Laboral"].includes(motivo))) {
        Alert.alert("Falta la justificación", "Selecciona el motivo y escribe una explicación breve.");
        return;
      }
      const { payload, gpsAccuracyMeters, evaluacion } = await prepararMarcacionRH({
        empleado: empleadoVigente, personalNumber: numeroRegistro,
        email: empleadoVigente.email || correo,
        type: tipo, modalidad: modalidadEfectiva, registros: registrosParaValidar,
        viajeDesde: modalidadEfectiva === "Viaje de negocios" ? viajeDesde : "",
        viajeHasta: modalidadEfectiva === "Viaje de negocios" ? viajeHasta : "",
      });
      // Validación fresca justo antes del POST (después del GPS), para evitar
      // duplicados de otro teléfono/canal sin duplicar innecesariamente los GET.
      const alEnviar = await validarMarcacionActualSAP(tipo, modalidadEfectiva);
      if (alEnviar.modalidadActual !== modalidadEfectiva || alEnviar.cuarto !== esCuartoAhora ||
          (!alEnviar.cuarto && !!(alEnviar.evaluacion.retardo || alEnviar.evaluacion.salidaAnticipada) !== requiereMotivo)) {
        setDialog(null);
        Alert.alert("Validaciones actualizadas", "SAP cambió el estado de tu jornada. Revisa nuevamente la marcación.");
        return;
      }
      if (!!(evaluacion.retardo || evaluacion.salidaAnticipada) !== !!(resultado.retardo || resultado.salidaAnticipada)) {
        setDialog(null);
        Alert.alert("Horario actualizado", "La hora de tu jornada cambió durante la captura. Intenta nuevamente.");
        return;
      }
      pendiente = {
        id: `${Date.now()}-${tipo}-${Math.random().toString(36).slice(2,7)}`,
        personalNumber, numeroRegistro, email: employee.email || correo, type: tipo,
        date: payload.EnterDate, time: payload.EnterHour.slice(0,5), registerHour: payload.EnterHour,
        registerType: TIPOS_RH[tipo], modality: alEnviar.modalidadActual,
        fourthLate: alEnviar.cuarto,
        typeSession: payload.TypeSession, gpsAccuracyMeters,
        createdAt: new Date().toISOString(), demo: false, sapState: "sending",
        late: !!evaluacion.retardo, early: !!evaluacion.salidaAnticipada,
        needsJustification: requiereMotivo,
        justificationState: requiereMotivo ? "pending" : null,
        // Este valor es local y NO forma parte de ningún JSON enviado a SAP.
        ...(requiereMotivo ? { reason: motivo, comment: comentario.trim(), recuperarTiempo } : {}),
        payload, // copia exacta para reintento MANUAL seguro tras verificar en SAP.
      };
      guardados = [...records, pendiente];
      await persistir(guardados); // Guardar acuse ANTES del primer POST.
      envioIniciado = true;
      const respuesta = await enviarMarcacionRH(payload);
      asistenciaAceptada = true;
      guardados = guardados.map(x => x.id === pendiente.id
        ? { ...x, sapState: "accepted", httpStatus: respuesta.httpStatus,
            sapMessage: respuesta.message, sapStatusReq: respuesta.statusReq,
            attendanceIdLog: respuesta.idLog || "", payload: null, errorDetail: "" } : x);
      try { await persistir(guardados); }
      catch (_) {
        setRecords(guardados);
        setDialog(null);
        Alert.alert("Registro por revisar", "La marcación recibió respuesta, pero no pudimos guardar el comprobante. No la repitas; contacta a Recursos Humanos.");
        return;
      }
      if (!requiereMotivo) {
        setDialog(null);
        Alert.alert("Registro confirmado por SAP", `${respuesta.message || "SAP confirmó el registro."}\nEstado: ${respuesta.statusReq}${respuesta.idLog ? `\nFolio: ${respuesta.idLog}` : ""}`);
        return;
      }

      // Segunda operación INDEPENDIENTE: si falla, NUNCA repetir P10/P20.
      // Id_log: no se inventa. Si ABAP lo asigna, admite cadena vacía; confirmar contrato.
      const justificacion = prepararJustificacionRH({
        personalNumber: numeroRegistro, enterDate: payload.EnterDate,
        enterHour: payload.EnterHour, registerType: payload.RegisterType,
        motivo, comentario: comentario.trim(), recuperarTiempo, idLog: "",
      });
      guardados = guardados.map(x => x.id === pendiente.id
        ? { ...x, justificationState: "sending", justificationPayload: justificacion } : x);
      try {
        await persistir(guardados); // No hacer POST si no se puede persistir este estado.
        const respJust = await enviarJustificacionRH(justificacion);
        guardados = guardados.map(x => x.id === pendiente.id
          ? { ...x, justificationState: "accepted", justificationIdLog: respJust.idLog,
              justificationStatus: respJust.status, justificationMessage: respJust.message,
              justificationError: "", justificationPayload: null } : x);
        await persistir(guardados);
        setDialog(null);
        Alert.alert("Registros confirmados por SAP", `Marcación: ${respuesta.message || "Registro exitoso."}${respuesta.idLog ? `\nFolio asistencia: ${respuesta.idLog}` : ""}\nJustificación: ${respJust.message || "Recibida."}${respJust.idLog ? `\nFolio incidencia: ${respJust.idLog}` : ""}`);
      } catch (justError) {
        // Un timeout no indica si ABAP guardó la justificación: no reintentar automáticamente.
        guardados = guardados.map(x => x.id === pendiente.id
          ? { ...x, justificationState: rechazoConfirmadoRH(justError) ? "rejected" : "uncertain",
              justificationError: errorDeSapRH(justError), justificationStatus: justError?.sapStatus || "" } : x);
        try { await persistir(guardados); } catch (_) { setRecords(guardados); }
        setDialog(null);
        Alert.alert("Justificación no confirmada",
          `La asistencia sí fue confirmada por SAP, pero la justificación no.\n${errorDeSapRH(justError)}\n${rechazoConfirmadoRH(justError) ? "Puedes reintentar SOLO la justificación desde su detalle." : "El resultado es incierto; verifica primero con Recursos Humanos para evitar duplicados."}`);
      }
    } catch (e) {
      if (asistenciaAceptada) {
        // Nunca cambiar una asistencia confirmada a 'uncertain' por fallas posteriores.
        setDialog(null);
        Alert.alert("Registro por revisar", "Tu marcación fue recibida. Consulta con Recursos Humanos para completar la justificación.");
      } else if (envioIniciado && pendiente) {
        const detalle = errorDeSapRH(e);
        const sinConfirmar = guardados.map(x => x.id === pendiente.id ? {
          ...x, sapState: rechazoConfirmadoRH(e) ? "rejected" : "uncertain",
          errorDetail: detalle, sapStatusReq: e?.sapStatus || "", httpStatus: e?.httpStatus || e?.response?.status || null
        } : x);
        try { await persistir(sinConfirmar); } catch (_) { setRecords(sinConfirmar); }
        setDialog(null);
        Alert.alert("No se confirmó la marcación", `${detalle}\nConsulta las opciones de revisión para verificar en SAP y, si no existe, solicitar un reintento manual.`);
      } else {
        const detalle = /GPS|ubicación|permiso|hora|comida|horario|modalidad|viaje|justificación/i.test(e?.message || "")
          ? e.message : "Verifica tu conexión e inténtalo nuevamente.";
        Alert.alert("No se pudo registrar", detalle);
      }
    } finally {
      busyRef.current = false; setBusy(false);
      refreshPerfil();
      setSyncTick(n => n + 1);
    }
  };
  // Consulta histórica antes de habilitar reintentos; jamás se reenvía automáticamente.
  const verificarYReintentar = async r => {
    if (bloquearPorColaRH || sinConexion !== false) {
      Alert.alert("Conciliación pendiente", "Primero revisa los registros offline de RRHH antes de reintentar solicitudes anteriores.");
      return;
    }
    if (busyRef.current || !["sending", "uncertain", "rejected"].includes(r.sapState)) return;
    busyRef.current = true; setBusy(true);
    try {
      const { registros: history } = await consultarHistorialRH({
        personalNumber: numeroRegistro,
        // La fecha real de P20 puede ser el día SIGUIENTE al inicio del turno.
        // Verificar toda la jornada, no solamente EnterDate de la salida.
        desde: r.jornadaDate || fechaJornada,
        hasta: r.jornadaDate || fechaJornada,
        scheduleDetail: empleadoVigente?.scheduleDetail || "",
      });
      const existente = history.find(h => h.registerType === r.registerType && h.date === r.date);
      if (existente) {
        const actual = records.map(x => x.id === r.id ? { ...x, sapState: "accepted",
          sapMessage: existente.message || "Registro encontrado en historial SAP.",
          sapStatusReq: existente.statusReq || "OK", attendanceIdLog: existente.id || "",
          errorDetail: "", payload: null } : x);
        await persistir(actual);
        Alert.alert("Registro encontrado", "SAP ya tiene este movimiento; NO se volvió a enviar. Si necesitaba justificación, revisa su estado con Recursos Humanos.");
        return;
      }
      if (!r.payload || !r.payload.EnterDate || !r.payload.EnterHour) {
        Alert.alert("Se requiere revisión", "SAP no devolvió el registro, pero este comprobante antiguo no conserva la solicitud original. No se recreará con otra hora. Contacta a Recursos Humanos.");
        return;
      }
      if (r.sapState !== "rejected" && Date.now() - Date.parse(r.createdAt || "") < 120000) {
        Alert.alert("Espera para verificar", "El resultado de la petición es incierto. Espera al menos dos minutos para dar tiempo a SAP a actualizar el historial.");
        return;
      }
      Alert.alert("SAP no mostró el movimiento",
        `No aparece ${r.registerType} el ${r.date} en el historial consultado. Esto no garantiza que SAP no lo haya recibido.\nError anterior: ${r.errorDetail || "sin detalle"}\n\n¿Deseas reenviar MANUALMENTE el mismo registro (misma fecha y hora)?`,
        [{ text: "Cancelar", style: "cancel" },
          { text: "Reenviar", onPress: () => reenviarMarcacion(r) }]);
    } catch (e) {
      Alert.alert("No se pudo verificar SAP", `${errorDeSapRH(e)}\nNo se enviará de nuevo hasta poder consultar el historial.`);
    } finally { busyRef.current = false; setBusy(false); }
  };

  const reenviarMarcacion = async r => {
    if (busyRef.current || !r.payload || bloquearPorColaRH || sinConexion !== false) return;
    busyRef.current = true; setBusy(true);
    let actuales = records;
    try {
      actuales = actuales.map(x => x.id === r.id ? { ...x, sapState: "sending", errorDetail: "" } : x);
      await persistir(actuales);
      const out = await enviarMarcacionRH(r.payload);
      actuales = actuales.map(x => x.id === r.id ? {
        ...x, sapState: "accepted", sapStatusReq: out.statusReq, sapMessage: out.message,
        attendanceIdLog: out.idLog, payload: null, errorDetail: "",
      } : x);
      await persistir(actuales);
      Alert.alert("Marcación confirmada por SAP", `${out.message || "Registro exitoso."}${out.idLog ? `\nFolio: ${out.idLog}` : ""}${r.needsJustification ? "\nTu justificación aún debe verificarse por separado." : ""}`);
    } catch (e) {
      actuales = actuales.map(x => x.id === r.id ? { ...x,
        sapState: rechazoConfirmadoRH(e) ? "rejected" : "uncertain", errorDetail: errorDeSapRH(e),
        sapStatusReq: e?.sapStatus || "", httpStatus: e?.httpStatus || e?.response?.status || null,
      } : x);
      try { await persistir(actuales); } catch (_) { setRecords(actuales); }
      Alert.alert("No se confirmó el reenvío", `${errorDeSapRH(e)}\nNo vuelvas a reenviar sin verificar el historial SAP.`);
    } finally { busyRef.current = false; setBusy(false); }
  };

  const reintentarJustificacion = r => {
    if (busyRef.current || !["pending", "rejected"].includes(r.justificationState)) return;
    // Para movimientos del pasado que no guardaron los segundos originales, no inventar la hora.
    const horaOriginal = r.justificationPayload?.RegisterHourLate || r.registerHour || r.payload?.EnterHour;
    if (!horaOriginal) {
      Alert.alert("Revisión necesaria", "Falta la hora exacta del movimiento original. Pide a Recursos Humanos verificar su justificación.");
      return;
    }
    const confirmar = async () => {
      if (busyRef.current) return;
      busyRef.current = true; setBusy(true);
      let actual = records;
      try {
        // Conservar exactamente la marcación anterior; solo se reintenta la justificación.
        // Compatibilidad con acuses previos que todavía no tenían Istimepay.
        const payloadJust = r.justificationPayload
          ? { ...r.justificationPayload, Istimepay: r.recuperarTiempo === true ? "X" : "" }
          : prepararJustificacionRH({
              personalNumber: r.numeroRegistro || numeroRegistro, enterDate: r.date,
              enterHour: horaOriginal, registerType: r.registerType,
              motivo: r.reason, comentario: r.comment,
              recuperarTiempo: r.recuperarTiempo === true, idLog: "",
            });
        actual = actual.map(x => x.id === r.id ? {
          ...x, justificationState: "sending", justificationPayload: payloadJust,
        } : x);
        await persistir(actual);
        const out = await enviarJustificacionRH(payloadJust);
        actual = actual.map(x => x.id === r.id ? { ...x, justificationState: "accepted",
          justificationStatus: out.status, justificationMessage: out.message,
          justificationIdLog: out.idLog, justificationPayload: null, justificationError: "" } : x);
        await persistir(actual);
        Alert.alert("Justificación confirmada", `${out.message || "Registro exitoso."}${out.idLog ? `\nFolio: ${out.idLog}` : ""}`);
      } catch (e) {
        actual = actual.map(x => x.id === r.id ? { ...x,
          justificationState: rechazoConfirmadoRH(e) ? "rejected" : "uncertain",
          justificationError: errorDeSapRH(e) } : x);
        try { await persistir(actual); } catch (_) { setRecords(actual); }
        Alert.alert("No se confirmó la justificación", errorDeSapRH(e));
      } finally { busyRef.current = false; setBusy(false); }
    };
    Alert.alert(r.justificationState === "pending" ? "Enviar justificación pendiente" : "Reintentar justificación",
      `Solo se enviará la justificación, nunca la marcación. ${r.justificationError ? `Error anterior: ${r.justificationError}` : ""} ¿Continuar?`,
      [{ text: "Cancelar", style: "cancel" }, { text: "Enviar", onPress: confirmar }]);
  };

  const resolverPendiente = (r, existe) => Alert.alert("Confirmar revisión",
    `Nómina ${r.numeroRegistro || numeroRegistro}\nFecha ${r.date}\nHora ${r.time}\nMovimiento ${MAP[r.type]?.title || "Asistencia"}\n\nConfirma con Recursos Humanos que el registro ${existe ? "sí aparece" : "no aparece"} en el historial antes de continuar.`,
    [{ text: "Cancelar", style: "cancel" }, { text: "Confirmar", onPress: async () => {
      if (busyRef.current) return;
      busyRef.current = true; setBusy(true);
      try {
        const raw = await AsyncStorage.getItem(storageKey);
        const actual = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(actual)) throw Error("Acuses inválidos.");
        const item = actual.find(x => x.id === r.id);
        if (!item || !["sending", "uncertain", "rejected"].includes(item.sapState)) throw Error("El estado del acuse cambió.");
        await persistir(actual.map(x => x.id === r.id ? { ...x,
          sapState: existe ? "accepted" : "not_recorded_sap", manuallyReviewed: true,
          reviewedAt: new Date().toISOString() } : x));
        Alert.alert("Revisión actualizada", "Se actualizó el estado de la marcación.");
      } catch (e) { Alert.alert("Error", e?.message || "No se guardó la revisión."); }
      finally { busyRef.current = false; setBusy(false); }
    }}]);

  if (loading) return <SafeAreaView style={s.safe}><View style={s.center}>
    <ActivityIndicator size="large" color={C.red}/>
    <Text style={s.muted}>Preparando tu asistencia…</Text>
  </View></SafeAreaView>;
  if (error || !employee) return <SafeAreaView style={s.safe}><View style={s.center}>
    <Ionicons name="alert-circle-outline" size={38} color={C.danger}/>
    <Text style={s.sectionTitle}>No se pudo abrir tu asistencia</Text>
    <Text style={[s.muted, { textAlign: "center" }]}>{error || "Intenta nuevamente."}</Text>
    <Btn title="Reintentar" icon="refresh-outline" onPress={() => { refreshPerfil(); setRefresh(x => x + 1); }}/>
    <Btn title="Volver al inicio" icon="arrow-back" outline onPress={() => router.replace("/rrhh")}/>
  </View></SafeAreaView>;

  if (!policy?.habilitado) return <SafeAreaView style={s.safe}><View style={s.center}>
    <Ionicons name="information-circle-outline" size={38} color={C.blue}/>
    <Text style={s.sectionTitle}>Marcaje no disponible</Text>
    <Text style={[s.muted, { textAlign: "center" }]}>{policy?.razon || "No tienes habilitado el registro por aplicación."}</Text>
    <Btn title="Ver historial" icon="calendar-outline" onPress={() => router.push("/rrhh/historial")}/>
    <Btn title="Volver a mis datos" icon="arrow-back" outline onPress={() => router.replace("/rrhh")}/>
  </View></SafeAreaView>;

  // Una sola vista para online y offline; cambian la fuente y el estado,
  // pero se mantienen las tarjetas, la linea de pasos y los botones originales.
  // Después de las 14:30, desaparece P25 y solo queda P20.
  const veredictoRegreso = inicioComidaVista && !regresoComidaVista ? revisar("comida_fin") : null;
  const comidaCerrada = !!veredictoRegreso?.fueraDeVentanaComida;
  // No presentar el estado provisional de los acuses locales como resultado definitivo
  // mientras aún falta validar EmployeeSet + AttendanceHistorySet en SAP.
  const verificandoSAP = sinConexion !== true && !sapListo && !estadoSAP.error &&
    (estadoSAP.cargando || perfilLoading || !!employee);
  const jornada = sinConexion === true
    ? (historialOffline.cargando ? "Consultando datos guardados…"
      : cuartoLocalDia ? "Jornada bloqueada por cuarto retardo (entrada pendiente de SAP)"
      : salidaVista && (pendientesJornadaRH.some(p => p.estado !== "confirmado") || acusesSinHistorial)
      ? "Jornada guardada · esperando SAP"
      : pendientesJornadaRH.some(p => p.estado !== "confirmado") || acusesSinHistorial
      ? "Marcaciones guardadas · esperando SAP"
      : salidaVista ? "Jornada finalizada (última consulta)"
      : !entradaVista ? "Aún no has registrado tu entrada"
      : inicioComidaVista && !regresoComidaVista && !comidaCerrada ? "En horario de comida"
      : "Jornada en curso · sin conexión")
    : !sapListo ? (verificandoSAP ? "Consultando información de SAP…" : "No se pudo verificar la jornada")
    : viajeYaEnviado || (viajeActivo && !!entradaVista) ? "Viaje de negocios registrado"
    : estadoSAP.resumen?.inasistenciaSAP || entradaFueCuarto ? "Jornada bloqueada por inasistencia/cuarto retardo"
    : salidaVista && acusesSinHistorial ? "Enviado · verificando historial SAP"
    : salidaVista ? "Jornada finalizada" : pendientesReales.length || acusesSinHistorial ? "Registro por conciliar"
    : !entradaVista ? "Aún no has registrado tu entrada"
    : inicioComidaVista && !regresoComidaVista && !comidaCerrada ? "En horario de comida" : "Jornada en curso";
  const soloDosRegistros = policy?.sindicalizado || modalidadEfectiva === "HomeOffice" || hoyEnHomeOffice;
  const esViajeModalidad = modalidadEfectiva === "Viaje de negocios";
  const pasosVisibles = (viajeActivo || viajeYaEnviado || esViajeModalidad) ? ["entrada"] :
    soloDosRegistros ? ["entrada", "salida"] : ORDEN;
  const botones = bloqueadaJornadaSAP ? [] : !entradaVista ? ["entrada"] : (salidaVista || esViajeModalidad) ? []
    : soloDosRegistros ? ["salida"]
    : inicioComidaVista && !regresoComidaVista ? (comidaCerrada ? ["salida"] : ["comida_fin", "salida"])
    : !inicioComidaVista ? ["comida_inicio", "salida"] : ["salida"];
  const principal = botones.find(t => t !== "salida") || botones[0] || null;
  const secundaria = botones.includes("salida") && principal !== "salida" ? "salida" : null;
  const resultadoPrincipal = principal ? revisar(principal) : null;
  const mensajePrincipal = sinConexion !== true && (
    resultadoPrincipal?.mensaje?.includes("SAP") ||
    resultadoPrincipal?.mensaje?.includes("ScheduleDetail") ||
    resultadoPrincipal?.mensaje?.includes("TypeSession"))
    ? "No podemos habilitar este registro. Comunícate con Recursos Humanos."
    : resultadoPrincipal?.mensaje;
  const faltaModalidad = requiereElegirModalidad && !modalidadLista && !bloqueadaJornadaSAP && !esCuartoAhora;
  const salidaAnticipadaAhora = !!revisar("salida")?.salidaAnticipada;
  const etiquetaSalida = salidaAnticipadaAhora ? "Registrar salida anticipada" : "Registrar salida";
  const bloquearBotonesMarcacion = busy || actualizandoSAP || sincronizandoRH || !!pendientesReales.length ||
    (sinConexion === true
      ? (cargandoColaRH || !!errorColaRH || hayPendientesRevisionOffline)
      : bloquearPorColaRH);

  // UX unificada: un aviso breve + una sola accion relevante.
  // La bitacora y los errores tecnicos siguen guardados en SQLite,
  // pero NO se muestran como botones o bloques repetidos en la pantalla.
  const filaPorRevisar = pendientesOffline.find(f =>
    ["incierto", "revision", "rechazado"].includes(f.estado) ||
    (f.estado === "confirmado" &&
      ["incierto", "revision", "rechazado"].includes(f.justificacionEstado)));
  const hayEnvioEnProceso = pendientesOffline.some(f => f.estado === "enviando");
  const acuseOnlinePorRevisar = pendientesReales[0] || null;
  const justificacionOnlinePorRevisar = justificacionesSinConfirmar[0] || null;
  const hayAlgoPendiente = colaPendienteRH || acusesSinHistorial ||
    !!acuseOnlinePorRevisar || !!justificacionOnlinePorRevisar;
  const avisoUnico = sinConexion === true
    ? (hayAlgoPendiente ? "Tienes registros guardados. Se enviarán cuando vuelva internet."
      : "Sin conexión. Tus marcaciones se guardarán en el dispositivo.")
    : filaPorRevisar || acuseOnlinePorRevisar || justificacionOnlinePorRevisar
    ? (viajeActivo && !!entradaVista
      ? "SAP ya tiene la entrada de tu viaje. Hay un comprobante local que requiere conciliación; no vuelvas a registrar entrada."
      : "Un registro necesita revisión. Sus datos siguen guardados.")
    : hayEnvioEnProceso ? "Hay un envío en proceso."
    : colaPendienteRH ? "Tienes registros pendientes de sincronización."
    : acusesSinHistorial ? "Registro enviado. Esperando confirmación en el historial SAP."
    : "";
  const necesitaGestion = sinConexion === false && hayAlgoPendiente;
  const etiquetaAccionUnica = viajeActivo && !!entradaVista && filaPorRevisar
    ? "Conciliar entrada de viaje"
    : filaPorRevisar || acuseOnlinePorRevisar || justificacionOnlinePorRevisar
    ? "Revisar y reintentar"
    : hayEnvioEnProceso || acusesSinHistorial ? "Consultar estado en SAP"
    : colaPendienteRH ? "Sincronizar pendientes"
    : "Actualizar estado desde SAP";
  const ejecutarAccionUnica = () => {
    if (filaPorRevisar) {
      if (filaPorRevisar.estado === "confirmado") {
        confirmarReenvioJustificacionOffline(filaPorRevisar);
      } else {
        verificarAntesDeReenviarOffline(filaPorRevisar);
      }
    } else if (acuseOnlinePorRevisar) {
      verificarYReintentar(acuseOnlinePorRevisar);
    } else if (justificacionOnlinePorRevisar) {
      if (["rejected", "pending"].includes(justificacionOnlinePorRevisar.justificationState)) {
        reintentarJustificacion(justificacionOnlinePorRevisar);
      } else {
        Alert.alert("Justificación pendiente", "Consulta con Recursos Humanos antes de volver a enviarla.");
      }
    } else if (hayEnvioEnProceso || acusesSinHistorial) {
      setRevisionColaRH(n => n + 1);
      setSyncTick(n => n + 1);
    } else if (colaPendienteRH) {
      sincronizarColaAhora();
    } else {
      setSyncTick(n => n + 1);
    }
  };

  return <SafeAreaView style={s.safe}>
    <StatusBar barStyle="dark-content" backgroundColor={C.white}/>
    <View style={s.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Regresar"
        onPress={() => router.back()} style={s.back}>
        <Ionicons name="arrow-back" size={23} color={C.ink}/>
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={s.headerTitle}>Registrar asistencia</Text>
        <Text style={s.headerSub}>Mi jornada de hoy</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Abrir historial"
        onPress={() => router.push("/rrhh/historial")}>
        <Ionicons name="calendar-outline" color={C.red} size={23}/>
      </Pressable>
    </View>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={s.content}>
        <View style={s.employeeBar}>
          <Ionicons name="person-circle-outline" size={34} color={C.red}/>
          <View style={{ flex: 1 }}>
            <Text style={s.employeeName}>{employee.fullName}</Text>
            <Text style={s.muted}>Nómina {numeroRegistro}</Text>
          </View>
          <View style={{ alignItems: "flex-end", gap: 3 }}>
            <Text style={s.dateBadge}>{ahora.toLocaleDateString("es-MX", { day: "numeric", month: "short" })}</Text>
            {sinConexion === true && <Text style={s.warning}>Sin conexión</Text>}
          </View>
        </View>

        <View style={s.card}>
          <View style={s.jornadaHeader}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={s.sectionTitle}>Estado de mi jornada</Text>
              <Text style={s.muted}>{jornada}</Text>
            </View>
            <Ionicons name={sinConexion === true ? "cloud-offline-outline" :
                !sapListo ? "alert-circle-outline" : salida ? "checkmark-circle" :
                pendientesReales.length || colaPendienteRH || acusesSinHistorial ? "alert-circle" : "time-outline"}
              size={23} color={sinConexion === true ? C.amber :
                !sapListo ? C.danger : salida ? C.green :
                pendientesReales.length || colaPendienteRH || acusesSinHistorial ? C.amber : C.blue}/>
          </View>
          {sinConexion !== true && !sapListo && !verificandoSAP && <View style={s.sapErrorBox} accessibilityLiveRegion="polite">
            <Ionicons name="alert-circle-outline" size={25} color={C.danger}/>
            <Text style={s.sapLoadingTitle}>No pudimos verificar la información de SAP.</Text>
            <Text style={s.sapLoadingText}>{estadoSAP.error || "Consulta de nuevo para recuperar el estado de tu jornada."}</Text>
          </View>}
          {pantallaJornadaDisponible && <View style={s.timeline}>{pasosVisibles.map((tipo, idx) => {
            const confirmado = ultimo(aceptados, tipo);
            const registro = confirmado || ultimo(pendientesDeHoyVisuales, tipo);
            const pendienteLocal = !confirmado && registro?.source === "RH_OFFLINE";
            return <View key={tipo} style={s.step}>
              <View style={[s.stepCircle, confirmado && s.stepDone,
                pendienteLocal && { backgroundColor: C.amber, borderColor: C.amber }]}>
                {confirmado ? <Ionicons name="checkmark" color={C.white} size={15}/>
                  : pendienteLocal ? <Ionicons name="time-outline" color={C.white} size={16}/>
                  : <Text style={s.stepNumber}>{idx + 1}</Text>}
              </View>
              <Text style={s.stepLabel}>{MAP[tipo].title}</Text>
              <Text style={[s.stepTime, registro && { color: pendienteLocal ? C.amber : C.green }]}>
                {registro?.time || "--:--"}</Text>
              {pendienteLocal && <Text style={[s.note, { color: C.amber, textAlign: "center", fontSize: 9 }]}>
                {registro.estadoOffline === "pendiente" ? "Pendiente" :
                  registro.estadoOffline === "confirmado" ? "Por conciliar" : "Por revisar"}</Text>}
            </View>;
          })}</View>}
          {pantallaJornadaDisponible && policy?.sindicalizado && !policy?.relacion?.viaje &&
            <Text style={s.turnoLine}>Modalidad: {policy?.relacion?.homeOffice ? "Home Office" : "Presencial"}</Text>}
          {pantallaJornadaDisponible && turno?.valido && <Text style={s.turnoLine}>
            <Ionicons name="time-outline" size={15} color={C.sub}/>  Horario de hoy: {turno.textoInicio}–{turno.textoFin}
          </Text>}
          {sapListo && estadoSAP.cacheError && <Text style={s.warning}>
            No fue posible actualizar la copia offline. Verifica el almacenamiento.
          </Text>}
        </View>

        {/* Los acuses y justificaciones anteriores se gestionan desde la accion
            unica de Registrar movimiento. La bitacora se conserva intacta. */}

        {pantallaJornadaDisponible && requiereElegirModalidad && !esCuartoAhora && !bloqueadaJornadaSAP && <View style={s.card}>
          <CardTitle title="1. Modalidad de trabajo"
            sub="Elige cómo trabajarás hoy antes de registrar tu entrada."
            icon="briefcase-outline"/>
          {bloqueoModalidadSinDatos && <Text style={s.warning}>
            Encontramos registros que requieren revisión. Comunícate con Recursos Humanos.
          </Text>}
          {modalidadLista && <View style={s.modeSummary}>
            <Ionicons name="checkmark-circle" size={20} color={C.green}/>
            <Text style={s.modeText}>{modalidadEfectiva === "HomeOffice" ? "Home Office" : modalidadEfectiva}</Text>
            {!modoBloqueado && requiereElegirModalidad && <Pressable accessibilityRole="button"
              onPress={() => setExtraOpen(x => !x)}>
              <Text style={s.expandLabel}>Cambiar</Text>
            </Pressable>}
          </View>}
          {requiereElegirModalidad && !modoBloqueado && !bloqueoModalidadSinDatos && (extraOpen || !modalidadLista) && <>
            {modalidades.map(x => <Pick key={x}
              title={x === "HomeOffice" ? "Home Office" : x}
              selected={modalidad === x} onPress={() => {
                if (x === "HomeOffice" && cuotaHOUsada) return;
                setModalidad(x);
                setModalidadGuardada(null);
              }} disabled={busy || (x === "HomeOffice" && cuotaHOUsada)}/>) }
            {modalidad === "Viaje de negocios" && <View style={{ gap: 9 }}>
              <Text style={s.fieldLabel}>Fechas de tu viaje</Text>
              <View style={s.travelRow}>
                <Pressable accessibilityRole="button" accessibilityLabel="Seleccionar inicio del viaje"
                  style={s.travelDate} onPress={() => setViajePicker("desde")}>
                  <Text style={s.travelCaption}>Desde</Text>
                  <Text style={s.travelDateText}>{fechaCorta(viajeDesde)}</Text>
                  <Ionicons name="calendar-outline" size={18} color={C.red}/>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="Seleccionar fin del viaje"
                  style={s.travelDate} onPress={() => setViajePicker("hasta")}>
                  <Text style={s.travelCaption}>Hasta</Text>
                  <Text style={s.travelDateText}>{fechaCorta(viajeHasta)}</Text>
                  <Ionicons name="calendar-outline" size={18} color={C.red}/>
                </Pressable>
              </View>
              <Text style={s.note}>Selecciona un período que incluya el día de hoy.</Text>
            </View>}
            <Btn title="Confirmar modalidad" icon="checkmark-circle-outline"
              disabled={busy || (sinConexion === true
                ? cargandoColaRH || !!errorColaRH || hayPendientesRevisionOffline
                : bloquearPorColaRH)} onPress={guardarModalidad}/>
          </>}
          {requiereElegirModalidad && modoBloqueado && <Text style={s.note}>
            Esta modalidad se mantiene durante toda la jornada.
          </Text>}
        </View>}

        <View style={s.card}>
          <CardTitle title={requiereElegirModalidad ? "2. Registrar movimiento" : "Registrar movimiento"}
            icon="finger-print-outline"/>
          {sinConexion !== true && !sapListo && !verificandoSAP && <View style={s.sapInlineStatus} accessibilityLiveRegion="polite">
            <Ionicons name="alert-circle-outline" size={19} color={C.danger}/>
            <Text style={s.sapInlineText}>No se pudo consultar SAP. Intenta actualizar.</Text>
          </View>}
          {sinConexion === true && !historialOffline.cargando && !!historialOffline.error &&
            <Text style={s.warning}>No se pudo cargar la última jornada guardada.</Text>}
          {sapListo && cuotaHOUsada && !entrada && policy?.confianza && <Text style={s.note}>
            Home Office no disponible: ya hay un día registrado con esta modalidad en la semana.
          </Text>}
          {sapListo && esCuartoAhora && <Text style={s.warning}>
            Ya tienes tres retardos este mes. Si registras entrada ahora, será el cuarto.
          </Text>}
          {sapListo && (viajeYaEnviado || (viajeActivo && !!entradaVista)) && <Text style={s.note}>
            Viaje de negocios registrado. No necesitas marcaciones adicionales.
          </Text>}
          {sapListo && (estadoSAP.resumen?.inasistenciaSAP || entradaFueCuarto || cuartoPendienteConfirmar) &&
            <Text style={s.warning}>Jornada bloqueada. Contacta a Recursos Humanos.</Text>}
          {!!avisoUnico && !sincronizandoRH && <Text style={necesitaGestion ? s.warning : s.note}>
            {avisoUnico}
          </Text>}
          {/* Una acción; el spinner permanece en el botón y conserva la pantalla visible. */}
          {sinConexion !== true && <Btn
            title={sincronizandoRH ? "Sincronizando con SAP…" : actualizandoSAP
              ? "Actualizando información…" : etiquetaAccionUnica}
            icon={necesitaGestion && !filaPorRevisar && colaPendienteRH ? "cloud-upload-outline" : "refresh-outline"}
            loading={sincronizandoRH || (actualizandoSAP && !verificandoSAP)}
            outline={!necesitaGestion}
            disabled={busy || actualizandoSAP || estadoSAP.cargando || cargandoColaRH || !!errorColaRH ||
              (necesitaGestion && origenPerfil !== "sap")}
            onPress={ejecutarAccionUnica}/>}
          {!!mensajeSync && !sincronizandoRH && sinConexion === false &&
            <Text style={s.note}>{mensajeSync}</Text>}
          {!policy?.habilitado && <Text style={s.warning}>
            {policy?.razon || "Tu asistencia no está habilitada desde la aplicación."}
          </Text>}
          {pantallaJornadaDisponible && faltaModalidad && <Text style={s.note}>Primero confirma tu modalidad de trabajo.</Text>}
          {comidaCerrada && !salida && <Text style={s.warning}>
            Terminó el horario de comida a las 14:30. El regreso ya no está disponible; solo puedes registrar la salida.
          </Text>}
          {pantallaJornadaDisponible && principal && <>
            <Btn title={principal === "entrada" ? "Registrar entrada" :
                principal === "comida_inicio" ? "Iniciar comida" :
                principal === "comida_fin" ? "Regresar de comida" : etiquetaSalida}
              icon={MAP[principal].icon}
              onPress={() => abrir(principal)}
              disabled={!modalidadLista || !resultadoPrincipal?.permitido || bloquearBotonesMarcacion}/>
            {!!resultadoPrincipal && !resultadoPrincipal.permitido && modalidadLista &&
              !pendientesReales.length && !hayAlgoPendiente && <Text style={s.note}>{mensajePrincipal}</Text>}
            {!!resultadoPrincipal?.retardo && <Text style={s.warning}>
              Tu entrada se registrará con retardo.
            </Text>}
          </>}
          {pantallaJornadaDisponible && secundaria && <Pressable accessibilityRole="button"
            disabled={!modalidadLista || bloquearBotonesMarcacion || !revisar(secundaria).permitido}
            onPress={() => abrir(secundaria)}
            style={[s.exitLink, (!modalidadLista || bloquearBotonesMarcacion || !revisar(secundaria).permitido) && s.disabled]}>
            <Text style={s.expandLabel}>{etiquetaSalida}</Text>
            <Ionicons name="arrow-forward" size={16} color={C.blue}/>
          </Pressable>}
          {pantallaJornadaDisponible && salidaVista && !hayAlgoPendiente &&
            <Text style={s.success}>Completaste tus registros de hoy.</Text>}
          {pantallaJornadaDisponible && !turno?.valido && !salidaVista && <Text style={s.note}>
            No encontramos un horario válido para hoy. Consulta con Recursos Humanos.
          </Text>}
        </View>

        {pantallaJornadaDisponible && deHoy.length > 0 && <View style={s.card}>
          <Text style={s.sectionTitle}>Movimientos de hoy</Text>
          {deHoy.filter(r => (r.source === "RH_OFFLINE" || r.source === "SAP" ||
            !movimientosRemotos.some(sap => sap.type === r.type)) &&
            !["rejected", "not_recorded_sap"].includes(r.sapState))
            .slice().reverse().map(r => <View style={s.record} key={r.id || `${r.type}-${r.time}`}>
            <Ionicons name={MAP[r.type]?.icon || "time-outline"} size={19} color={C.red}/>
            <View style={{ flex: 1 }}>
              <Text style={s.recordTitle}>{MAP[r.type]?.title || "Marcación"}</Text>
              <Text style={s.muted}>{r.source === "RH_OFFLINE"
                ? r.estadoOffline === "pendiente" ? "Pendiente de envío"
                : r.estadoOffline === "confirmado" ? "Enviado · por confirmar en historial"
                : "Requiere revisión"
                : r.source === "SAP" ? (sinConexion === true ? "Última consulta SAP" : "Confirmado en SAP")
                : r.sapState === "accepted" ? "Confirmado en SAP"
                : "Por verificar"}</Text>
            </View>
            <Text style={s.recordTime}>{r.time || "--:--"}</Text>
          </View>)}
        </View>}
        <Btn title="Ver historial de asistencias" icon="calendar-outline" outline
          onPress={() => router.push("/rrhh/historial")}/>
      </ScrollView>
      {verificandoSAP && <View style={s.sapGeneralOverlay} accessibilityLiveRegion="polite">
        <View style={s.sapGeneralCard}>
          <ActivityIndicator size="large" color={C.red}/>
          <Text style={s.sapLoadingTitle}>Consultando información de SAP…</Text>
          <Text style={s.sapLoadingText}>
            Estamos verificando tu horario, tus movimientos y el estado de tu jornada.
          </Text>
        </View>
      </View>}
    </KeyboardAvoidingView>

    <Modal visible={!!dialog} transparent animationType="fade" onRequestClose={() => !busy && setDialog(null)}>
      <View style={s.overlay}><View style={s.modal}>
        <Ionicons name="finger-print-outline" size={29} color={C.red}/>
        <Text style={s.modalTitle}>{dialog?.early ? "Confirmar salida anticipada" : `Confirmar ${MAP[dialog?.tipo]?.title?.toLowerCase() || "registro"}`}</Text>
        <Text style={s.modalText}>Modalidad: {modalidadEfectiva === "HomeOffice" ? "Home Office" : modalidadEfectiva}</Text>
        {sinConexion === true && <Text style={s.note}>
          El registro y su justificacion quedaran guardados localmente. SAP aun no los ha recibido.
        </Text>}
        {!!dialog?.aviso && <Text style={s.modalText}>{dialog.aviso}</Text>}
        {(dialog?.late || dialog?.early) && <>
          <Text style={s.fieldLabel}>Motivo {dialog.late ? "del retardo" : "de salida anticipada"}</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {["Laboral", "Personal"].map(x => <View key={x} style={{ flex: 1 }}>
              <Pick title={x} selected={motivo === x} onPress={() => setMotivo(x)}/>
            </View>)}
          </View>
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: recuperarTiempo }}
            onPress={() => setRecuperarTiempo(x => !x)} style={s.checkboxRow}>
            <Ionicons name={recuperarTiempo ? "checkbox-outline" : "square-outline"}
              color={recuperarTiempo ? C.green : C.sub} size={23}/>
            <Text style={s.checkboxLabel}>¿Recuperarás el tiempo?</Text>
          </Pressable>
          <TextInput style={[s.textInput, { minHeight: 70, textAlignVertical: "top" }]}
            value={comentario} onChangeText={setComentario} multiline
            maxLength={500} placeholder="Explica brevemente el motivo (obligatorio)"/>
        </>}
        <Btn title={busy ? "Guardando…" : (sinConexion === true ? "Guardar en el telefono" : "Confirmar registro")} icon="checkmark-circle-outline"
          disabled={busy} onPress={registrar}/>
        <Btn title="Cancelar" icon="close-outline" outline disabled={busy}
          onPress={() => setDialog(null)}/>
      </View></View>
    </Modal>

    {Platform.OS === "android" && !!viajePicker && <DateTimePicker
      mode="date" display="default"
      value={fechaParaPicker(viajePicker === "desde" ? viajeDesde : viajeHasta)}
      minimumDate={viajePicker === "hasta" && viajeDesde ? fechaParaPicker(viajeDesde) : undefined}
      onChange={elegirFechaViaje}/>} 
    {Platform.OS === "ios" && <Modal visible={!!viajePicker} transparent animationType="slide"
      onRequestClose={() => setViajePicker(null)}>
      <View style={s.overlay}><View style={s.modal}>
        <Text style={s.modalTitle}>{viajePicker === "desde" ? "Inicio del viaje" : "Fin del viaje"}</Text>
        <DateTimePicker mode="date" display="spinner" locale="es-MX"
          value={fechaParaPicker(viajePicker === "desde" ? viajeDesde : viajeHasta)}
          minimumDate={viajePicker === "hasta" && viajeDesde ? fechaParaPicker(viajeDesde) : undefined}
          onChange={elegirFechaViaje}/>
        <Btn title="Listo" onPress={() => setViajePicker(null)} icon="checkmark-outline"/>
      </View></View>
    </Modal>}
  </SafeAreaView>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg }, center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 22, gap: 15 },
  header: { backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.border, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  back: { paddingVertical: 7, width: 28 }, headerTitle: { color: C.ink, fontSize: 18, fontWeight: "800" },
  headerSub: { fontSize: 11, color: C.sub }, content: { padding: 17, paddingBottom: 38, gap: 14 },
  employeeBar: { backgroundColor: C.white, borderRadius: 14, padding: 14, flexDirection: "row", gap: 11, alignItems: "center", borderWidth: 1, borderColor: C.border },
  employeeName: { color: C.ink, fontSize: 15, fontWeight: "800" }, muted: { color: C.sub, fontSize: 12, lineHeight: 18 },
  card: { padding: 16, borderWidth: 1, borderColor: C.border, borderRadius: 16, backgroundColor: C.white, gap: 13 },
  offlineBanner: { backgroundColor: C.amberBg, borderColor: "#EAD8B1" },
  offlineLoading: { flexDirection: "row", alignItems: "center", gap: 10 },
  // Capa unica durante la consulta; evita mostrar tarjetas vacias o estados provisionales.
  sapGeneralOverlay: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0,
    backgroundColor: C.bg, justifyContent: "center", alignItems: "center", padding: 24,
    zIndex: 20, elevation: 20 },
  sapGeneralCard: { backgroundColor: C.white, borderWidth: 1, borderColor: C.border,
    borderRadius: 18, paddingVertical: 30, paddingHorizontal: 24, width: "100%",
    maxWidth: 350, alignItems: "center", gap: 14 },
  sapErrorBox: { alignItems: "center", justifyContent: "center", paddingVertical: 16, paddingHorizontal: 12, gap: 10, backgroundColor: C.pale, borderRadius: 12 },
  sapLoadingTitle: { fontSize: 13, fontWeight: "800", color: C.ink, textAlign: "center" },
  sapLoadingText: { fontSize: 12, lineHeight: 18, color: C.sub, textAlign: "center" },
  sapInlineStatus: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: C.bg, padding: 12, borderRadius: 11 },
  sapInlineText: { color: C.sub, fontSize: 12, lineHeight: 18, flex: 1 },
  sectionHeader: { flexDirection: "row", gap: 10, alignItems: "flex-start" }, sectionTitle: { color: C.ink, fontSize: 16, fontWeight: "800" },
  sub: { color: C.sub, fontSize: 12, marginTop: 4, lineHeight: 17 },
  status: { flexDirection: "row", alignItems: "center", padding: 11, gap: 9, borderRadius: 11 },
  amberBox: { backgroundColor: C.amberBg }, blueBox: { backgroundColor: C.blueBg },
  timeline: { flexDirection: "row", gap: 4, justifyContent: "space-between" },
  step: { flex: 1, alignItems: "center", gap: 6 }, stepCircle: { width: 29, height: 29, borderRadius: 16, backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center" },
  stepDone: { backgroundColor: C.green }, stepNumber: { color: C.sub, fontWeight: "700", fontSize: 12 },
  stepLabel: { textAlign: "center", color: C.sub, fontSize: 10, minHeight: 30 }, stepTime: { fontWeight: "800", fontSize: 11, color: C.sub },
  btn: { backgroundColor: C.red, borderRadius: 11, minHeight: 47, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  btnOutline: { backgroundColor: C.white, borderWidth: 1, borderColor: C.red }, btnDanger: { borderColor: C.danger },
  btnText: { fontWeight: "800", color: C.white, fontSize: 13, textAlign: "center" },
  disabled: { opacity: .42 }, pressed: { opacity: .8 }, note: { fontSize: 11, lineHeight: 17, color: C.sub },
  warning: { color: C.amber, fontSize: 12, lineHeight: 18, fontWeight: "600" },
  success: { color: C.green, fontSize: 12, lineHeight: 18 },
  expand: { flexDirection: "row", gap: 10, alignItems: "center" },
  choice: { flexDirection: "row", alignItems: "center", gap: 8, padding: 11, borderWidth: 1, borderColor: C.border, borderRadius: 10 },
  choiceSelected: { borderColor: C.red, backgroundColor: C.pale }, choiceText: { fontSize: 12, color: C.ink, fontWeight: "700" },
  fieldLabel: { color: C.ink, fontSize: 12, fontWeight: "700" }, textInput: { borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 9, color: C.ink, fontSize: 13 },
  checkboxRow: { flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 4 },
  checkboxLabel: { color: C.ink, fontWeight: "700", fontSize: 13 },
  record: { flexDirection: "row", gap: 10, alignItems: "center", borderBottomWidth: 1, borderBottomColor: C.border, paddingBottom: 11 },
  recordTitle: { color: C.ink, fontSize: 12, fontWeight: "700" }, recordTime: { fontSize: 12, color: C.ink, fontWeight: "800" },
  overlay: { flex: 1, backgroundColor: "#0008", justifyContent: "center", padding: 20 },
  modal: { backgroundColor: C.white, borderRadius: 18, padding: 20, gap: 12 },
  modalTitle: { fontSize: 18, fontWeight: "800", color: C.ink }, modalText: { color: C.ink, fontSize: 13, lineHeight: 20 },
  dateBadge: { fontSize: 11, color: C.sub },
  jornadaHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  turnoLine: { paddingTop: 10, borderTopColor: C.border, borderTopWidth: 1, color: C.sub, fontSize: 12 },
  reviewHead: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  expandLabel: { fontSize: 13, color: C.blue, fontWeight: "800" },
  modeSummary: { backgroundColor: C.greenBg, borderRadius: 11, flexDirection: "row", alignItems: "center", padding: 12, gap: 9 },
  modeText: { color: C.ink, fontSize: 14, fontWeight: "800", flex: 1 },
  exitLink: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 43 },
  travelRow: { flexDirection: "row", gap: 9 },
  travelDate: { flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: 11,
    padding: 12, backgroundColor: "#FBFCFE", gap: 6, minHeight: 91 },
  travelCaption: { fontSize: 11, color: C.sub },
  travelDateText: { fontSize: 13, color: C.ink, fontWeight: "700" },
});