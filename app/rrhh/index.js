// app/rrhh/index.js
import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Pressable,
  Modal,
  TextInput,
  StatusBar,
  Platform,
  Switch,
  KeyboardAvoidingView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import AsyncStorage from "@react-native-async-storage/async-storage";

// Prototipo: envío simulado y datos locales; no realiza peticiones a SAP/RH.
const STORAGE_KEY = "rh:prototype:mauricio:records:v1";
const localDay = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const weekKey = (day) => {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return localDay(d); // Semana de lunes a domingo.
};
const displayDate = (day) => day ? new Date(`${day}T12:00:00`).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" }) : "Sin seleccionar";

const COLORS = {
  bg: "#F3F5F8",
  card: "#FFFFFF",
  soft: "#F6F7F8",
  border: "#E8EAED",
  text: "#1F2937",
  secondary: "#596579",
  red: "#E60012",
  redSoft: "#FFF0F1",
  green: "#1C9159",
  greenSoft: "#EAF7F0",
  amber: "#94600C",
  amberSoft: "#FFF7E8",
  blue: "#355C7D",
  blueSoft: "#EDF3F7",
  danger: "#C83838",
  dangerSoft: "#FCEEEE",
};

const VIEWS = {
  INICIAL: "INICIAL",
  TEMPRANO: "TEMPRANO",
  GPS: "GPS",
  INICIADO: "INICIADO",
  RETARDO: "RETARDO",
  JORNADA: "JORNADA",
  JORNADA_FIN: "JORNADA_FIN",
  CIERRE_NORMAL: "CIERRE_NORMAL",
  PAUSA: "PAUSA",
  REGRESO: "REGRESO",
  SALIDA: "SALIDA",
  FINALIZADA: "FINALIZADA",
  MODALIDAD: "MODALIDAD",
  RESUMEN: "RESUMEN",
  HISTORIAL: "HISTORIAL",
  DETALLE: "DETALLE",
};

const DEMO_VIEWS = [
  { key: VIEWS.INICIAL, label: "Inicio" },
  { key: VIEWS.TEMPRANO, label: "Antes de hora" },
  { key: VIEWS.GPS, label: "GPS" },
  { key: VIEWS.INICIADO, label: "Entrada" },
  { key: VIEWS.RETARDO, label: "Retardo" },
  { key: VIEWS.JORNADA, label: "Jornada" },
  { key: VIEWS.PAUSA, label: "Comida" },
  { key: VIEWS.REGRESO, label: "Regreso" },
  { key: VIEWS.JORNADA_FIN, label: "Horario cumplido" },
  { key: VIEWS.CIERRE_NORMAL, label: "Salida normal" },
  { key: VIEWS.SALIDA, label: "Salida anticipada" },
  { key: VIEWS.FINALIZADA, label: "Final" },
  { key: VIEWS.MODALIDAD, label: "Modalidad" },
  { key: VIEWS.RESUMEN, label: "Resumen" },
  { key: VIEWS.HISTORIAL, label: "Historial" },
  { key: VIEWS.DETALLE, label: "Detalle" },
];

const EMPLOYEE = {
  name: "Mauricio Contreras Vega",
  payroll: "000123",
  area: "Recursos Humanos",
  schedule: "08:00 AM - 05:00 PM",
  shift: "Turno administrativo",
};

function Header({ onDemo }) {
  return <View style={styles.topHeader}>
    <Pressable accessibilityLabel="Regresar" accessibilityRole="button" style={styles.topIcon} onPress={() => router.back()}><Ionicons name="chevron-back" size={22} color={COLORS.text} /></Pressable>
    <View style={styles.brandMark}><Text style={styles.headerLogoText}>RH</Text></View>
    <View style={styles.topCopy}><Text style={styles.topTitle}>Mi asistencia</Text><Text style={styles.topSubtitle}>Recursos Humanos</Text></View>
    <Pressable onPress={onDemo} accessibilityRole="button" accessibilityLabel="Abrir pantallas de prueba" style={styles.topIcon}><Ionicons name="options-outline" size={22} color={COLORS.secondary} /></Pressable>
  </View>;
}

function EmployeeCard() {
  const [expanded, setExpanded] = useState(false);
  return <View style={styles.identityCard}>
    <Pressable onPress={() => setExpanded(v => !v)} accessibilityRole="button" accessibilityState={{ expanded }} style={styles.identityRow}>
      <View style={styles.identityAvatar}><Text style={styles.avatarText}>MC</Text></View>
      <View style={{ flex: 1, minWidth: 0 }}><Text style={styles.identityName}>{EMPLOYEE.name}</Text><Text style={styles.topSubtitle}>Nómina {EMPLOYEE.payroll} · 08:00–17:00</Text></View>
      <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color={COLORS.secondary} />
    </Pressable>
    {expanded && <View style={styles.identityDetails}><Text style={styles.infoText}>Área: {EMPLOYEE.area}</Text><Text style={styles.infoText}>{EMPLOYEE.shift} · {EMPLOYEE.schedule}</Text></View>}
  </View>;
}

function ClockCard({ time = "07:52 AM", label = "Hora actual" }) {
  return (
    <View style={styles.clockCard}>
      <Text style={styles.clockLabel}>{label}</Text>
      <Text style={styles.clockValue}>{time}</Text>
    </View>
  );
}

function StatusCard({
  icon = "checkmark",
  title,
  description,
  tone = "green",
}) {
  const tones = {
    green: {
      bg: COLORS.greenSoft,
      iconBg: "#DDF3E8",
      color: COLORS.green,
    },
    amber: {
      bg: COLORS.amberSoft,
      iconBg: "#FCECCB",
      color: COLORS.amber,
    },
    red: {
      bg: COLORS.dangerSoft,
      iconBg: "#F8DEDE",
      color: COLORS.danger,
    },
    blue: {
      bg: COLORS.blueSoft,
      iconBg: "#DEEAF1",
      color: COLORS.blue,
    },
  };

  const palette = tones[tone] || tones.green;

  return (
    <View style={[styles.statusCard, { backgroundColor: palette.bg }]}>
      <View style={[styles.statusIcon, { backgroundColor: palette.iconBg }]}>
        <Ionicons name={icon} size={18} color={palette.color} />
      </View>

      <View style={styles.statusCopy}>
        <Text style={styles.statusTitle}>{title}</Text>
        <Text style={styles.statusDescription}>{description}</Text>
      </View>
    </View>
  );
}

function PrimaryButton({
  children,
  onPress,
  disabled = false,
  icon,
  tone = "red",
}) {
  const background =
    tone === "dark" ? COLORS.text : tone === "green" ? COLORS.green : COLORS.red;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        { backgroundColor: disabled ? "#E7E9EC" : background },
        pressed && !disabled && styles.buttonPressed,
      ]}
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={18}
          color={disabled ? COLORS.secondary : "#FFFFFF"}
        />
      ) : null}

      <Text
        style={[
          styles.primaryButtonText,
          disabled && { color: COLORS.secondary },
        ]}
      >
        {children}
      </Text>
    </Pressable>
  );
}

function SecondaryButton({ children, onPress, icon, danger = false }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.secondaryButton,
        danger && { borderColor: "#F0C9CD", backgroundColor: "#FFF8F8" },
        pressed && styles.buttonPressed,
      ]}
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={18}
          color={danger ? COLORS.danger : COLORS.text}
        />
      ) : null}
      <Text
        style={[
          styles.secondaryButtonText,
          danger && { color: COLORS.danger },
        ]}
      >
        {children}
      </Text>
    </Pressable>
  );
}

function TimelineRow({ icon, title, time, last = false, active = false }) {
  return (
    <View style={styles.timelineRow}>
      <View style={styles.timelineVisual}>
        <View
          style={[
            styles.timelineDot,
            active && {
              borderColor: COLORS.red,
              backgroundColor: COLORS.redSoft,
            },
          ]}
        >
          <Ionicons
            name={icon}
            size={14}
            color={active ? COLORS.red : COLORS.secondary}
          />
        </View>
        {!last ? <View style={styles.timelineLine} /> : null}
      </View>

      <View style={styles.timelineCopy}>
        <Text style={styles.timelineTitle}>{title}</Text>
        <Text style={styles.timelineTime}>{time}</Text>
      </View>
    </View>
  );
}

function SummaryItem({ label, value, icon }) {
  return (
    <View style={styles.summaryItem}>
      <View style={styles.summaryIcon}>
        <Ionicons name={icon} size={18} color={COLORS.red} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.summaryLabel}>{label}</Text>
        <Text style={styles.summaryValue}>{value}</Text>
      </View>
    </View>
  );
}

function ModalCard({
  visible,
  title,
  description,
  icon = "help",
  confirmText = "Confirmar",
  onCancel,
  onConfirm,
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalIcon}>
            <Ionicons name={icon} size={26} color={COLORS.red} />
          </View>

          <Text style={styles.modalTitle}>{title}</Text>
          <Text style={styles.modalDescription}>{description}</Text>

          <View style={styles.modalButtons}>
            <Pressable style={styles.modalCancel} onPress={onCancel}>
              <Text style={styles.modalCancelText}>Cancelar</Text>
            </Pressable>

            <Pressable style={styles.modalConfirm} onPress={onConfirm}>
              <Text style={styles.modalConfirmText}>{confirmText}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Toast({ tone = "success", title, description }) {
  const toneData = {
    success: {
      bg: "#EFF9F4",
      border: "#CDEADB",
      icon: "checkmark",
      color: COLORS.green,
    },
    warning: {
      bg: "#FFF8E9",
      border: "#F2DFB4",
      icon: "alert",
      color: COLORS.amber,
    },
    error: {
      bg: "#FFF1F2",
      border: "#F0C9CE",
      icon: "close",
      color: COLORS.danger,
    },
    info: {
      bg: "#EFF5F9",
      border: "#D8E6EF",
      icon: "information",
      color: COLORS.blue,
    },
  };

  const current = toneData[tone];

  return (
    <View
      style={[
        styles.toast,
        { backgroundColor: current.bg, borderColor: current.border },
      ]}
    >
      <View style={[styles.toastIcon, { backgroundColor: "#FFFFFF" }]}>
        <Ionicons name={current.icon} size={18} color={current.color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.toastTitle}>{title}</Text>
        <Text style={styles.toastDescription}>{description}</Text>
      </View>
    </View>
  );
}

function InitialView({ setView, openModal }) {
  return (
    <>
      <ClockCard />

      <StatusCard
        icon="checkmark"
        title="Listo para iniciar"
        description="Horario y ubicación validados."
      />

      <SecondaryButton icon="business-outline" onPress={() => setView(VIEWS.MODALIDAD)}>Elegir o cambiar modalidad</SecondaryButton>
      <PrimaryButton onPress={() => openModal("start")}>
        Registrar inicio de labores
      </PrimaryButton>

      <PrimaryButton disabled>
        Fin de labores · No disponible
      </PrimaryButton>

      <SecondaryButton
        icon="time-outline"
        onPress={() => setView(VIEWS.HISTORIAL)}
      >
        Ver historial de asistencia
      </SecondaryButton>
    </>
  );
}

function TooEarlyView({ setView }) {
  return (
    <>
      <ClockCard time="07:10 AM" />

      <StatusCard
        icon="time-outline"
        title="Inicio aún no disponible"
        description="Podrás registrar tu entrada dentro de la ventana permitida."
        tone="amber"
      />

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>Horario de entrada</Text>
        <Text style={styles.infoBig}>08:00 AM</Text>
        <Text style={styles.infoText}>
          La ventana de registro estará disponible unos minutos antes del inicio
          de tu jornada.
        </Text>
      </View>

      <PrimaryButton disabled>Registrar inicio de labores</PrimaryButton>
      <SecondaryButton onPress={() => setView(VIEWS.INICIAL)}>
        Volver a estado disponible
      </SecondaryButton>
    </>
  );
}

function GpsView({ setView }) {
  return (
    <>
      <ClockCard />

      <StatusCard
        icon="location-outline"
        title="Ubicación requerida"
        description="Activa la ubicación del dispositivo para validar tu registro."
        tone="red"
      />

      <View style={styles.infoCard}>
        <View style={styles.bigIcon}>
          <Ionicons name="location" size={30} color={COLORS.red} />
        </View>
        <Text style={styles.centerTitle}>Necesitamos tu ubicación</Text>
        <Text style={styles.centerText}>
          Asegurate de tener tu ubicación activada para poder registrar tu inicio de jornada.
        </Text>
      </View>

      <PrimaryButton onPress={() => setView(VIEWS.INICIAL)} icon="location">
        Activar ubicación
      </PrimaryButton>
    </>
  );
}

function StartedView({ setView }) {
  return (
    <>
      <ClockCard time="08:01 AM" />

      <Toast
        title="Inicio registrado"
        description="Tu entrada fue registrada correctamente."
      />

      <StatusCard
        icon="checkmark"
        title="Jornada iniciada"
        description="Inicio de labores registrado a las 08:01 AM."
      />

      <View style={styles.metricRow}>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Entrada</Text>
          <Text style={styles.metricValue}>08:01</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Tiempo laborado</Text>
          <Text style={styles.metricValue}>00:00</Text>
        </View>
      </View>

      <PrimaryButton onPress={() => setView(VIEWS.JORNADA)}>
        Continuar a jornada en curso
      </PrimaryButton>
    </>
  );
}

function IncidentForm({ early = false, onSend, busy }) {
  const [reason, setReason] = useState("");
  const [comment, setComment] = useState("");
  const [recover, setRecover] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const send = () => onSend({ type: early ? "salida_anticipada" : "retardo", reason, comment: comment.trim(), recoverTime: recover, date: localDay() });
  return <>
    <View style={styles.sectionHead}>
      <Text style={styles.sectionTitle}>{early ? "Salida anticipada" : "Entrada con retardo"}</Text>
      <Text style={styles.sectionSubtitle}>{early ? "Confirma tu salida y agrega el motivo de la marcación." : "Selecciona el motivo para acompañar tu registro de entrada."}</Text>
    </View>
    <ClockCard time={early ? "04:35 PM" : "08:18 AM"} label={early ? "Hora de salida · ejemplo" : "Hora de entrada · ejemplo"} />
    <StatusCard tone="amber" icon="time-outline" title={early ? "25 minutos antes de tu salida" : "18 minutos de retardo"} description={early ? "Puedes registrar la salida anticipada. Tu horario termina a las 05:00 PM." : "La marcación conservará el retardo, independientemente del motivo."} />
    <View style={styles.formCard}>
      <Text style={styles.fieldLabel}>Motivo {early ? "de salida" : "del retardo"}</Text>
      <View style={styles.reasonRow}>{["Laboral", "Personal"].map(item => <Pressable key={item} accessibilityRole="radio" accessibilityState={{ checked: reason === item }} onPress={() => setReason(item)} style={[styles.reasonOption, reason === item && styles.selectedOption]}>
        <Ionicons name={reason === item ? "radio-button-on" : "radio-button-off"} size={20} color={reason === item ? COLORS.red : COLORS.secondary} />
        <Text style={styles.optionTitle}>{item}</Text>
      </Pressable>)}</View>
      <Text style={styles.fieldLabel}>Comentario <Text style={styles.optional}>(opcional)</Text></Text>
      <TextInput value={comment} onChangeText={setComment} multiline maxLength={500} textAlignVertical="top" placeholder="Agrega información sobre tu motivo" placeholderTextColor={COLORS.secondary} style={styles.textArea} accessibilityLabel="Comentario del motivo" />
      <Text style={styles.characterCount}>{comment.length}/500</Text>
      <View style={styles.recoverRow}><View style={{ flex: 1 }}><Text style={styles.optionTitle}>Recuperará tiempo</Text><Text style={styles.sectionSubtitle}>Indicador informativo</Text></View><Switch value={recover} onValueChange={setRecover} trackColor={{ false: "#CFD5DD", true: COLORS.red }} thumbColor="#FFFFFF" accessibilityLabel="Recuperará tiempo" /></View>
      <Text style={styles.infoText}>Este indicador acompaña la marcación; no modifica el horario ni calcula tiempo recuperado.</Text>
    </View>
    <PrimaryButton disabled={!reason || busy} onPress={() => early ? setConfirm(true) : send()} icon="send-outline">{busy ? "Guardando…" : early ? "Confirmar salida anticipada" : "Enviar marcación de retardo"}</PrimaryButton>
    <ModalCard visible={confirm} title="¿Registrar salida anticipada?" description={`Salida a las 04:35 PM. Motivo: ${reason}. Recuperará tiempo: ${recover ? "Sí" : "No"}.`} confirmText="Confirmar y enviar" icon="log-out-outline" onCancel={() => setConfirm(false)} onConfirm={() => { setConfirm(false); send(); }} />
  </>;
}

function WorkdayView({ setView, openModal, completed = false }) {
  return (
    <>

      <View style={styles.workdayHero}>
        <Text style={styles.workdayEyebrow}>JORNADA EN CURSO</Text>
        <Text style={styles.workdayTime}>{completed ? "8 h 27 min" : "3 h 42 min"}</Text>
        <Text style={styles.workdaySub}>
          {completed ? "Hora de salida · 05:03 PM" : "Inicio de labores · 08:01 AM"}
        </Text>
      </View>

      <StatusCard
        icon="briefcase-outline"
        title="Trabajando"
        description={completed ? "Tu horario terminó. Ya puedes registrar la salida normal." : "Tu jornada se encuentra activa."}
        tone="blue"
      />

      {!completed && <PrimaryButton onPress={() => openModal("pause")} icon="restaurant-outline">Registrar pausa de comida</PrimaryButton>}

      <SecondaryButton
        danger
        icon="log-out-outline"
        onPress={() => setView(completed ? VIEWS.CIERRE_NORMAL : VIEWS.SALIDA)}
      >
        {completed ? "Registrar fin de jornada" : "Registrar salida anticipada"}
      </SecondaryButton>

      <SecondaryButton onPress={() => setView(VIEWS.RESUMEN)} icon="stats-chart">
        Ver resumen
      </SecondaryButton>
    </>
  );
}

function LunchView({ setView }) {
  return (
    <>

      <Toast
        title="Pausa registrada"
        description="Tu pausa de comida inició a las 01:30 PM."
      />

      <View style={styles.workdayHero}>
        <Text style={styles.workdayEyebrow}>PAUSA DE COMIDA</Text>
        <Text style={styles.workdayTime}>00 h 18 min</Text>
        <Text style={styles.workdaySub}>Inicio de pausa · 01:30 PM</Text>
      </View>

      <StatusCard
        icon="restaurant-outline"
        title="En pausa de comida"
        description="Cuando regreses, registra tu regreso a labores."
        tone="amber"
      />

      <PrimaryButton onPress={() => setView(VIEWS.REGRESO)}>
        Registrar regreso de comida
      </PrimaryButton>
    </>
  );
}

function ReturnView({ setView }) {
  return (
    <>

      <Toast
        title="Regreso registrado"
        description="Tu regreso de comida se registró correctamente."
      />

      <StatusCard
        icon="checkmark"
        title="Jornada reanudada"
        description="Regreso de comida registrado a las 02:05 PM."
      />

      <View style={styles.timelineCard}>
        <TimelineRow icon="log-in-outline" title="Entrada" time="08:01 AM" />
        <TimelineRow icon="restaurant-outline" title="Inicio comida" time="01:30 PM" />
        <TimelineRow
          icon="play-outline"
          title="Regreso comida"
          time="02:05 PM"
          active
          last
        />
      </View>

      <PrimaryButton onPress={() => setView(VIEWS.JORNADA_FIN)}>
        Continuar jornada
      </PrimaryButton>
    </>
  );
}

function NormalFinishView({ onSend, busy, onBack }) {
  const [confirm, setConfirm] = useState(false);
  return <>
    <View style={styles.sectionHead}><Text style={styles.sectionTitle}>Finalizar jornada</Text><Text style={styles.sectionSubtitle}>Tu horario de trabajo ha terminado.</Text></View>
    <View style={styles.closingHero}><View style={styles.closingIcon}><Ionicons name="checkmark-done-outline" size={30} color={COLORS.green} /></View><Text style={styles.closingTitle}>Horario cumplido</Text><Text style={styles.closingTime}>05:03 PM</Text><Text style={styles.sectionSubtitle}>Hora de salida · ejemplo de registro</Text></View>
    <View style={styles.summaryCard}><SummaryItem label="Horario asignado" value="08:00 AM – 05:00 PM" icon="calendar-outline" /><SummaryItem label="Entrada" value="08:01 AM" icon="log-in-outline" /><SummaryItem label="Comida" value="01:30 – 02:05 PM" icon="restaurant-outline" /><SummaryItem label="Tiempo laborado" value="8 h 27 min" icon="time-outline" /></View>
    <Text style={styles.infoText}>La salida normal se registra sin motivo ni justificación.</Text>
    <PrimaryButton disabled={busy} icon="log-out-outline" onPress={() => setConfirm(true)}>{busy ? "Guardando…" : "Confirmar fin de jornada"}</PrimaryButton>
    <SecondaryButton onPress={onBack}>Volver a mi jornada</SecondaryButton>
    <ModalCard visible={confirm} title="¿Finalizar tu jornada?" description="Se registrará tu salida normal a las 05:03 PM y el cierre de la jornada." confirmText="Confirmar y registrar" icon="checkmark-done-outline" onCancel={() => setConfirm(false)} onConfirm={() => { setConfirm(false); onSend({ type: "salida_normal", date: localDay(), exitTime: "05:03 PM", total: "8 h 27 min" }); }} />
  </>;
}

function FinishedView({ setView, closing }) {
  const early = closing?.type === "salida_anticipada";
  return <>
    <View style={styles.closingHero}><View style={styles.closingIcon}><Ionicons name="checkmark-done-outline" size={30} color={COLORS.green} /></View><Text style={styles.closingTitle}>Jornada finalizada</Text><Text style={styles.sectionSubtitle}>{early ? "Tu salida anticipada quedó registrada." : "Tu salida normal quedó registrada."}</Text></View>
    <View style={styles.summaryCard}><SummaryItem label="Tipo de salida" value={early ? "Anticipada" : "Normal"} icon="log-out-outline" /><SummaryItem label="Hora de salida" value={early ? "04:35 PM" : "05:03 PM"} icon="time-outline" /><SummaryItem label="Tiempo laborado" value={early ? "7 h 59 min" : "8 h 27 min"} icon="briefcase-outline" /></View>
    {early && <View style={styles.formCard}><Text style={styles.fieldLabel}>Información de la marcación</Text><Text style={styles.infoText}>Motivo: {closing.reason}</Text>{!!closing.comment && <Text style={styles.infoText}>{closing.comment}</Text>}<Text style={styles.infoText}>Recuperará tiempo: {closing.recoverTime ? "Sí" : "No"}</Text></View>}
    <PrimaryButton onPress={() => setView(VIEWS.RESUMEN)}>Ver resumen de jornada</PrimaryButton>
    <SecondaryButton icon="calendar-outline" onPress={() => setView(VIEWS.HISTORIAL)}>Consultar historial</SecondaryButton>
  </>;
}

function RangeCalendar({ start, end, onChange }) {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const first = (month.getDay() + 6) % 7;
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((first + count) / 7) * 7 }, (_, i) => i >= first && i < first + count ? localDay(new Date(month.getFullYear(), month.getMonth(), i - first + 1)) : null);
  const choose = day => { if (!start || end || day < start) onChange(day, ""); else onChange(start, day); };
  return <View style={styles.formCard}>
    <Text style={styles.fieldLabel}>Fechas del viaje</Text>
    <Text style={styles.sectionSubtitle}>{!start ? "Selecciona la fecha de inicio." : !end ? "Selecciona la fecha de regreso (puede ser el mismo día)." : "Rango listo. Toca otra fecha para empezar de nuevo."}</Text>
    <View style={styles.calendarHeader}>
      <Pressable accessibilityLabel="Mes anterior" style={styles.calendarArrow} onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><Ionicons name="chevron-back" size={22} color={COLORS.text} /></Pressable>
      <Text style={styles.optionTitle}>{month.toLocaleDateString("es-MX", { month: "long", year: "numeric" })}</Text>
      <Pressable accessibilityLabel="Mes siguiente" style={styles.calendarArrow} onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><Ionicons name="chevron-forward" size={22} color={COLORS.text} /></Pressable>
    </View>
    <View style={styles.calendarGrid}>{["L", "M", "M", "J", "V", "S", "D"].map((label, i) => <View key={i} style={styles.calendarCell}><Text style={styles.calendarWeekday}>{label}</Text></View>)}</View>
    <View style={styles.calendarGrid}>{cells.map((day, i) => {
      const disabled = !day || day < localDay();
      const edge = day && (day === start || day === end);
      const between = day && start && end && day > start && day < end;
      return <Pressable key={day || `blank-${i}`} disabled={disabled} accessibilityLabel={day ? displayDate(day) : undefined} accessibilityRole="button" accessibilityState={{ disabled, selected: !!(edge || between) }} onPress={() => choose(day)} style={[styles.calendarCell, between && styles.rangeCell, edge && styles.edgeCell]}><Text style={[styles.calendarDay, disabled && { color: "#B7BDC5" }, edge && { color: "#FFFFFF" }]}>{day ? Number(day.slice(-2)) : ""}</Text></Pressable>;
    })}</View>
    <View style={styles.rangeSummary}><Text style={styles.infoText}>Inicio: {displayDate(start)}</Text><Text style={styles.infoText}>Regreso: {displayDate(end)}</Text></View>
  </View>;
}

function ModalityView({ records, loaded, busy, onSend }) {
  const [selected, setSelected] = useState("Presencial");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const used = records.some(r => r.type === "modalidad" && r.modality === "HomeOffice" && weekKey(r.date) === weekKey(localDay()));
  const options = [
    { label: "Presencial", icon: "business-outline", description: "Jornada en tu centro de trabajo." },
    { label: "HomeOffice", icon: "home-outline", description: used ? "Ya utilizaste esta modalidad esta semana." : "Disponible una vez por semana, de lunes a domingo." },
    { label: "Viaje de negocios", icon: "airplane-outline", description: "Selecciona el periodo de tu viaje laboral." },
  ];
  const blocked = !loaded || busy || (selected === "HomeOffice" && used) || (selected === "Viaje de negocios" && (!start || !end));
  return <>
    <View style={styles.sectionHead}><Text style={styles.sectionTitle}>Modalidad de trabajo</Text><Text style={styles.sectionSubtitle}>Elige cómo realizarás tu jornada antes de registrar la entrada.</Text></View>
    {options.map(item => {
      const active = selected === item.label;
      const disabled = item.label === "HomeOffice" && (used || !loaded);
      return <Pressable key={item.label} disabled={disabled} accessibilityRole="radio" accessibilityState={{ checked: active, disabled }} onPress={() => setSelected(item.label)} style={[styles.optionCard, active && styles.selectedOption, disabled && { opacity: 0.55 }]}>
        <View style={styles.optionIcon}><Ionicons name={item.icon} size={22} color={active ? COLORS.red : COLORS.secondary} /></View>
        <View style={{ flex: 1 }}><Text style={styles.optionTitle}>{item.label}</Text><Text style={styles.sectionSubtitle}>{item.description}</Text></View>
        <Ionicons name={active ? "radio-button-on" : "radio-button-off"} size={22} color={active ? COLORS.red : COLORS.secondary} />
      </Pressable>;
    })}
    {selected === "Viaje de negocios" && <RangeCalendar start={start} end={end} onChange={(a, b) => { setStart(a); setEnd(b); }} />}
    <PrimaryButton disabled={blocked} icon="send-outline" onPress={() => onSend({ type: "modalidad", date: localDay(), modality: selected, ...(selected === "Viaje de negocios" ? { startDate: start, endDate: end } : {}) })}>{busy ? "Guardando…" : "Enviar modalidad"}</PrimaryButton>
  </>;
}

function SummaryView({ setView, early = false }) {
  return (
    <>

      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Resumen de jornada</Text>
        <Text style={styles.sectionSubtitle}>Miércoles, 30 de septiembre</Text>
      </View>

      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>Total registrado</Text>
        <Text style={styles.totalValue}>{early ? "7 h 59 min" : "8 h 27 min"}</Text>
        <View style={styles.totalLine} />
        <Text style={styles.totalHint}>{early ? "Salida anticipada" : "Jornada completa"}</Text>
      </View>

      <View style={styles.timelineCard}>
        <TimelineRow icon="log-in-outline" title="Entrada" time="08:01 AM" />
        <TimelineRow icon="restaurant-outline" title="Inicio comida" time="01:30 PM" />
        <TimelineRow icon="play-outline" title="Regreso comida" time="02:05 PM" />
        <TimelineRow
          icon="log-out-outline"
          title="Salida"
          time={early ? "04:35 PM" : "05:03 PM"}
          last
        />
      </View>

      <PrimaryButton onPress={() => setView(VIEWS.HISTORIAL)}>
        Ver historial de asistencia
      </PrimaryButton>
    </>
  );
}

function HistoryView({ setView, records = [] }) {
  const days = [
    { date: "Mié 30 Sep", time: "8 h 20 min", status: "Completa" },
    { date: "Mar 29 Sep", time: "8 h 05 min", status: "Completa" },
    { date: "Lun 28 Sep", time: "7 h 46 min", status: "Retardo" },
    { date: "Vie 25 Sep", time: "8 h 12 min", status: "Completa" },
  ];

  return (
    <>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Historial de asistencia</Text>
        <Text style={styles.sectionSubtitle}>
          Consulta tus últimos registros.
        </Text>
      </View>

      {records.slice().reverse().map(record => <View key={record.id} style={styles.formCard}>
        <Text style={styles.optionTitle}>{record.type === "modalidad" ? record.modality : record.type === "retardo" ? "Entrada con retardo" : record.type === "salida_normal" ? "Salida normal" : "Salida anticipada"}</Text>
        <Text style={styles.sectionSubtitle}>{displayDate(record.date)}</Text>
        {record.startDate && <Text style={styles.infoText}>{displayDate(record.startDate)} – {displayDate(record.endDate)}</Text>}
        {record.exitTime && <Text style={styles.infoText}>Salida: {record.exitTime} · {record.total}</Text>}
        {record.reason && <><Text style={styles.infoText}>Motivo: {record.reason}</Text>{!!record.comment && <Text style={styles.infoText}>{record.comment}</Text>}<Text style={styles.infoText}>Recuperará tiempo: {record.recoverTime ? "Sí" : "No"}</Text></>}
      </View>)}
      <Text style={styles.fieldLabel}>Ejemplos de asistencia</Text>
      {days.map((item, index) => (
        <Pressable
          key={item.date}
          onPress={() => setView(VIEWS.DETALLE)}
          style={styles.historyCard}
        >
          <View style={styles.historyDateIcon}>
            <Ionicons name="calendar-outline" size={20} color={COLORS.red} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.historyDate}>{item.date}</Text>
            <Text style={styles.historyTime}>{item.time}</Text>
          </View>
          <View
            style={[
              styles.historyStatus,
              item.status === "Retardo" && { backgroundColor: COLORS.amberSoft },
            ]}
          >
            <Text
              style={[
                styles.historyStatusText,
                item.status === "Retardo" && { color: COLORS.amber },
              ]}
            >
              {item.status}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#A8ADB3" />
        </Pressable>
      ))}
    </>
  );
}

function DetailView({ setView }) {
  return (
    <>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Detalle del día</Text>
        <Text style={styles.sectionSubtitle}>Miércoles, 30 de septiembre</Text>
      </View>

      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>Total registrado</Text>
        <Text style={styles.totalValue}>8 h 20 min</Text>
      </View>

      <View style={styles.timelineCard}>
        <TimelineRow icon="log-in-outline" title="Entrada" time="08:01 AM" />
        <TimelineRow icon="restaurant-outline" title="Inicio comida" time="01:30 PM" />
        <TimelineRow icon="play-outline" title="Regreso comida" time="02:05 PM" />
        <TimelineRow icon="log-out-outline" title="Salida" time="05:03 PM" last />
      </View>

      <StatusCard
        icon="checkmark"
        title="Jornada completa"
        description="Todos los movimientos fueron registrados."
      />

      <SecondaryButton onPress={() => setView(VIEWS.HISTORIAL)}>
        Regresar al historial
      </SecondaryButton>
    </>
  );
}

export default function RHPrototype() {
  const [view, changeView] = useState(VIEWS.MODALIDAD);
  const setView = next => { setNotice(null); changeView(next); };
  const [records, setRecords] = useState([]);
  const [closing, setClosing] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [modality, setModality] = useState(null);
  const saving = useRef(false);
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      const data = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(data)) throw new Error("Datos inválidos");
      if (active) { setRecords(data); setLoaded(true); }
    }).catch(() => { if (active) setNotice({ tone: "error", title: "No se pudieron cargar los registros", description: "Vuelve a abrir esta pantalla para intentar de nuevo." }); });
    return () => { active = false; };
  }, []);
  const sendRecord = async record => {
    if (!loaded || saving.current) return;
    if (record.modality === "HomeOffice" && records.some(r => r.modality === "HomeOffice" && weekKey(r.date) === weekKey(record.date))) {
      setNotice({ tone: "warning", title: "HomeOffice no disponible", description: "Sólo puedes seleccionarlo una vez por semana." }); return;
    }
    saving.current = true; setBusy(true);
    try {
      const next = [...records, { ...record, id: String(Date.now()), savedAt: new Date().toISOString() }];
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setRecords(next);
      if (record.type === "modalidad") setModality(record);
      if (record.type === "salida_normal" || record.type === "salida_anticipada") setClosing(record);
      setNotice({ tone: "success", title: "Registro guardado en el prototipo", description: "Envío simulado correctamente. Aún no está conectado al servicio de RH." });
      changeView(record.type === "modalidad" ? VIEWS.INICIAL : record.type === "retardo" ? VIEWS.JORNADA : VIEWS.FINALIZADA);
    } catch { setNotice({ tone: "error", title: "No se pudo guardar", description: "Tus datos siguen en el formulario. Intenta nuevamente." }); }
    finally { saving.current = false; setBusy(false); }
  };
  const [modalType, setModalType] = useState(null);
  const [showDemo, setShowDemo] = useState(false);

  const openModal = (type) => setModalType(type);

  const confirmModal = () => {
    const current = modalType;
    setModalType(null);

    if (current === "start") {
      setView(VIEWS.INICIADO);
      return;
    }

    if (current === "pause") {
      setView(VIEWS.PAUSA);
      return;
    }


  };

  const renderView = () => {
    switch (view) {
      case VIEWS.TEMPRANO:
        return <TooEarlyView setView={setView} />;
      case VIEWS.GPS:
        return <GpsView setView={setView} />;
      case VIEWS.INICIADO:
        return <StartedView setView={setView} />;
      case VIEWS.RETARDO:
        return <IncidentForm onSend={sendRecord} busy={busy || !loaded} />;
      case VIEWS.JORNADA:
        return <WorkdayView setView={setView} openModal={openModal} />;
      case VIEWS.JORNADA_FIN:
        return <WorkdayView setView={setView} openModal={openModal} completed />;
      case VIEWS.CIERRE_NORMAL:
        return <NormalFinishView onSend={sendRecord} busy={busy || !loaded} onBack={() => setView(VIEWS.JORNADA_FIN)} />;
      case VIEWS.PAUSA:
        return <LunchView setView={setView} />;
      case VIEWS.REGRESO:
        return <ReturnView setView={setView} />;
      case VIEWS.SALIDA:
        return <IncidentForm early onSend={sendRecord} busy={busy || !loaded} />;
      case VIEWS.FINALIZADA:
        return <FinishedView setView={setView} closing={closing} />;
      case VIEWS.MODALIDAD:
        return <ModalityView records={records} loaded={loaded} busy={busy} onSend={sendRecord} />;
      case VIEWS.RESUMEN:
        return <SummaryView setView={setView} />;
      case VIEWS.HISTORIAL:
        return <HistoryView setView={setView} records={records} />;
      case VIEWS.DETALLE:
        return <DetailView setView={setView} />;
      case VIEWS.INICIAL:
      default:
        return (
          <InitialView
            setView={setView}
            openModal={openModal}
          />
        );
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor={COLORS.bg}
      />

      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Header onDemo={() => setShowDemo(true)} />
        <Modal visible={showDemo} transparent animationType="slide" onRequestClose={() => setShowDemo(false)}>
          <View style={styles.modalOverlay}><View style={styles.demoSheet}>
            <View style={styles.identityRow}><View style={{ flex: 1 }}><Text style={styles.sectionTitle}>Pantallas de prueba</Text><Text style={styles.sectionSubtitle}>Selecciona el escenario que quieres revisar.</Text></View><Pressable onPress={() => setShowDemo(false)} accessibilityLabel="Cerrar pantallas de prueba" style={styles.topIcon}><Ionicons name="close" size={24} color={COLORS.text} /></Pressable></View>
            <ScrollView contentContainerStyle={styles.scenarioList}>{DEMO_VIEWS.map(item => <Pressable key={item.key} accessibilityRole="button" onPress={() => { setNotice(null); setView(item.key); setShowDemo(false); }} style={[styles.scenarioItem, view === item.key && styles.selectedOption]}><Text style={styles.optionTitle}>{item.label}</Text><Ionicons name="chevron-forward" size={18} color={COLORS.secondary} /></Pressable>)}</ScrollView>
          </View></View>
        </Modal>

        <ScrollView
          key={view}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
        >
          <EmployeeCard />
          {notice && <Toast {...notice} />}
          {modality && [VIEWS.INICIAL, VIEWS.JORNADA, VIEWS.JORNADA_FIN].includes(view) && <View style={styles.modalityStrip}><Ionicons name="business-outline" size={16} color={COLORS.blue} /><Text style={styles.modalityStripText}>{modality.modality}{modality.startDate ? ` · ${displayDate(modality.startDate)} – ${displayDate(modality.endDate)}` : ""}</Text></View>}
          {renderView()}
        </ScrollView>

        <View style={styles.bottomNav}>
          <Pressable style={styles.navItem} onPress={() => router.back()}>
            <Ionicons name="home-outline" size={22} color={COLORS.secondary} />
            <Text style={styles.navLabel}>Inicio</Text>
          </Pressable>

          <Pressable
            style={styles.navItem}
            onPress={() => { setNotice(null); setView(closing ? VIEWS.FINALIZADA : VIEWS.INICIAL); }}
          >
            <Ionicons name="time" size={22} color={COLORS.red} />
            <Text style={[styles.navLabel, styles.navLabelActive]}>
              Asistencia
            </Text>
          </Pressable>

          <Pressable
            style={styles.navItem}
            onPress={() => { setNotice(null); setView(VIEWS.HISTORIAL); }}
          >
            <Ionicons name="calendar-outline" size={22} color={COLORS.secondary} />
            <Text style={styles.navLabel}>Historial</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <ModalCard
        visible={modalType === "start"}
        title="Confirmar registro"
        description="¿Deseas registrar el inicio de labores?"
        confirmText="Confirmar"
        onCancel={() => setModalType(null)}
        onConfirm={confirmModal}
      />

      <ModalCard
        visible={modalType === "pause"}
        title="Confirmar pausa"
        description="¿Deseas registrar el inicio de tu pausa de comida?"
        confirmText="Registrar"
        icon="restaurant-outline"
        onCancel={() => setModalType(null)}
        onConfirm={confirmModal}
      />

    </SafeAreaView>
  );
}

const cardShadow = Platform.select({
  default: {},
});

const styles = StyleSheet.create({
  topHeader: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight || 0) + 6 : 6, paddingBottom: 12, backgroundColor: COLORS.card, borderBottomWidth: 1, borderColor: COLORS.border },
  topIcon: { width: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  brandMark: { width: 38, height: 38, borderRadius: 12, backgroundColor: COLORS.red, alignItems: "center", justifyContent: "center" },
  topCopy: { flex: 1, minWidth: 0 },
  topTitle: { fontSize: 18, lineHeight: 24, fontWeight: "800", color: COLORS.text },
  topSubtitle: { fontSize: 12, lineHeight: 18, color: COLORS.secondary, marginTop: 3 },
  identityCard: { borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card, borderRadius: 16, padding: 12 },
  identityRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  identityAvatar: { width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.redSoft, justifyContent: "center", alignItems: "center" },
  identityName: { color: COLORS.text, fontWeight: "700", fontSize: 14, lineHeight: 20 },
  identityDetails: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderColor: COLORS.border, gap: 6 },
  modalityStrip: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: COLORS.blueSoft },
  modalityStripText: { flex: 1, color: COLORS.blue, fontSize: 13, lineHeight: 19, fontWeight: "600" },
  closingHero: { padding: 24, alignItems: "center", gap: 12, backgroundColor: COLORS.card, borderRadius: 22, borderWidth: 1, borderColor: COLORS.border },
  closingIcon: { width: 64, height: 64, borderRadius: 22, backgroundColor: COLORS.greenSoft, justifyContent: "center", alignItems: "center" },
  closingTitle: { fontSize: 22, lineHeight: 28, color: COLORS.text, fontWeight: "800", textAlign: "center" },
  closingTime: { fontSize: 32, lineHeight: 40, color: COLORS.text, fontWeight: "800" },
  demoSheet: { width: "100%", maxWidth: 520, maxHeight: "85%", borderRadius: 24, padding: 20, backgroundColor: COLORS.card },
  scenarioList: { gap: 8, paddingTop: 16, paddingBottom: 10 },
  scenarioItem: { padding: 14, minHeight: 50, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: COLORS.border, borderRadius: 12 },

  formCard: { backgroundColor: COLORS.card, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, padding: 16, gap: 12 },
  reasonRow: { flexDirection: "row", gap: 10 },
  reasonOption: { flex: 1, minHeight: 52, borderRadius: 14, padding: 12, flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: COLORS.border },
  selectedOption: { backgroundColor: COLORS.redSoft, borderColor: COLORS.red },
  optional: { color: COLORS.secondary, fontWeight: "400" },
  characterCount: { textAlign: "right", color: COLORS.secondary, fontSize: 12 },
  recoverRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 12, borderTopWidth: 1, borderColor: COLORS.border },
  calendarHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  calendarArrow: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  calendarGrid: { flexDirection: "row", flexWrap: "wrap" },
  calendarCell: { width: "14.285714%", minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 8 },
  calendarWeekday: { color: COLORS.secondary, fontSize: 12, fontWeight: "700" },
  calendarDay: { color: COLORS.text, fontSize: 14, fontWeight: "600" },
  rangeCell: { backgroundColor: COLORS.redSoft },
  edgeCell: { backgroundColor: COLORS.red },
  rangeSummary: { borderTopWidth: 1, borderColor: COLORS.border, paddingTop: 12, gap: 6 },

  safe: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },

  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },




  headerLogoText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },
















  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
    gap: 16,
  },



  avatarText: {
    fontSize: 14,
    fontWeight: "900",
    color: COLORS.red,
  },










  clockCard: {
    minHeight: 94,
    borderRadius: 18,
    backgroundColor: "#23354D",
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 18,
    paddingVertical: 12,
    justifyContent: "center",
    ...cardShadow,
  },

  clockLabel: {
    color: "#CFD9E7",
    fontSize: 13,
    fontWeight: "700",
  },

  clockValue: {
    marginTop: 3,
    color: "#FFFFFF",
    fontSize: 29,
    lineHeight: 34,
    fontWeight: "900",
  },

  statusCard: {
    minHeight: 80,
    borderRadius: 18,
    paddingHorizontal: 13,
    paddingVertical: 13,
    flexDirection: "row",
    alignItems: "center",
  },

  statusIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },

  statusCopy: {
    flex: 1,
    marginLeft: 12,
  },

  statusTitle: {
    color: COLORS.text,
    fontSize: 13,
    lineHeight: 21,
    fontWeight: "800",
  },

  statusDescription: {
    marginTop: 3,
    color: COLORS.secondary,
    fontSize: 12,
    lineHeight: 18,
  },

  primaryButton: {
    minHeight: 54,
    borderRadius: 14,
    paddingHorizontal: 18,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
  },

  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "800",
    textAlign: "center",
  },

  secondaryButton: {
    minHeight: 52,
    borderRadius: 14,
    paddingHorizontal: 18,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  secondaryButtonText: {
    color: COLORS.text,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "800",
    textAlign: "center",
  },

  buttonPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.99 }],
  },

  infoCard: {
    borderRadius: 18,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 18,
    ...cardShadow,
  },

  infoTitle: {
    color: COLORS.secondary,
    fontSize: 13,
    fontWeight: "700",
  },

  infoBig: {
    marginTop: 7,
    color: COLORS.text,
    fontSize: 28,
    fontWeight: "900",
  },

  infoText: {
    marginTop: 8,
    color: COLORS.secondary,
    fontSize: 13,
    lineHeight: 21,
  },

  bigIcon: {
    alignSelf: "center",
    width: 64,
    height: 64,
    borderRadius: 22,
    backgroundColor: COLORS.redSoft,
    alignItems: "center",
    justifyContent: "center",
  },

  centerTitle: {
    marginTop: 14,
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "800",
    textAlign: "center",
  },

  centerText: {
    marginTop: 7,
    color: COLORS.secondary,
    fontSize: 13,
    lineHeight: 21,
    textAlign: "center",
  },

  metricRow: {
    flexDirection: "row",
    gap: 10,
  },

  metricCard: {
    flex: 1,
    minHeight: 88,
    borderRadius: 17,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
  },

  metricLabel: {
    color: COLORS.secondary,
    fontSize: 12,
    fontWeight: "700",
  },

  metricValue: {
    marginTop: 8,
    color: COLORS.text,
    fontSize: 21,
    lineHeight: 26,
    fontWeight: "900",
  },

  fieldLabel: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "800",
  },

  textArea: {
    minHeight: 104,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: COLORS.text,
    fontSize: 14,
    lineHeight: 18,
    textAlignVertical: "top",
  },

  workdayHero: {
    minHeight: 132,
    borderRadius: 20,
    backgroundColor: "#23354D",
    paddingHorizontal: 18,
    paddingVertical: 17,
    justifyContent: "center",
  },

  workdayEyebrow: {
    color: "#CFD9E7",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.9,
  },

  workdayTime: {
    marginTop: 8,
    color: "#FFFFFF",
    fontSize: 30,
    fontWeight: "900",
  },

  workdaySub: {
    marginTop: 7,
    color: "#CFD9E7",
    fontSize: 13,
    lineHeight: 19,
  },

  timelineCard: {
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    ...cardShadow,
  },

  timelineRow: {
    minHeight: 68,
    flexDirection: "row",
  },

  timelineVisual: {
    width: 42,
    alignItems: "center",
  },

  timelineDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.soft,
    alignItems: "center",
    justifyContent: "center",
  },

  timelineLine: {
    flex: 1,
    width: 2,
    backgroundColor: "#ECEEF0",
    marginVertical: 4,
  },

  timelineCopy: {
    flex: 1,
    paddingLeft: 10,
    paddingTop: 4,
  },

  timelineTitle: {
    color: COLORS.text,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "800",
  },

  timelineTime: {
    marginTop: 3,
    color: COLORS.secondary,
    fontSize: 12,
    lineHeight: 18,
  },

  summaryCard: {
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    gap: 12,
  },

  summaryItem: {
    flexDirection: "row",
    alignItems: "center",
  },

  summaryIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: COLORS.redSoft,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  summaryLabel: {
    color: COLORS.secondary,
    fontSize: 12,
    fontWeight: "700",
  },

  summaryValue: {
    marginTop: 3,
    color: COLORS.text,
    fontSize: 13,
    lineHeight: 21,
    fontWeight: "800",
  },

  sectionHead: {
    marginBottom: 2,
  },

  sectionTitle: {
    color: COLORS.text,
    fontSize: 20,
    lineHeight: 25,
    fontWeight: "900",
  },

  sectionSubtitle: {
    marginTop: 4,
    color: COLORS.secondary,
    fontSize: 13,
    lineHeight: 20,
  },

  optionCard: {
    gap: 12,
    paddingVertical: 14,
    minHeight: 78,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
  },

  optionIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: COLORS.soft,
    alignItems: "center",
    justifyContent: "center",
  },

  optionTitle: {
    color: COLORS.text,
    fontSize: 13,
    lineHeight: 21,
    fontWeight: "800",
  },

  totalCard: {
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 18,
    ...cardShadow,
  },

  totalLabel: {
    color: COLORS.secondary,
    fontSize: 13,
    fontWeight: "700",
  },

  totalValue: {
    marginTop: 6,
    color: COLORS.text,
    fontSize: 28,
    fontWeight: "900",
  },

  totalLine: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 13,
  },

  totalHint: {
    color: COLORS.green,
    fontSize: 12,
    fontWeight: "800",
  },

  historyCard: {
    minHeight: 76,
    borderRadius: 17,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    ...cardShadow,
  },

  historyDateIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: COLORS.redSoft,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },

  historyDate: {
    color: COLORS.text,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "800",
  },

  historyTime: {
    marginTop: 3,
    color: COLORS.secondary,
    fontSize: 12,
    lineHeight: 18,
  },

  historyStatus: {
    borderRadius: 999,
    backgroundColor: COLORS.greenSoft,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginRight: 7,
  },

  historyStatusText: {
    color: COLORS.green,
    fontSize: 11,
    fontWeight: "800",
  },

  toast: {
    minHeight: 66,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "center",
  },

  toastIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },

  toastTitle: {
    color: COLORS.text,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "800",
  },

  toastDescription: {
    marginTop: 3,
    color: COLORS.secondary,
    fontSize: 12,
    lineHeight: 18,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(18, 20, 23, 0.48)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },

  modalCard: {
    width: "100%",
    maxWidth: 330,
    borderRadius: 24,
    backgroundColor: "#FFFFFF",
    padding: 20,
    alignItems: "center",
  },

  modalIcon: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: COLORS.redSoft,
    alignItems: "center",
    justifyContent: "center",
  },

  modalTitle: {
    marginTop: 14,
    color: COLORS.text,
    fontSize: 17,
    fontWeight: "900",
    textAlign: "center",
  },

  modalDescription: {
    marginTop: 8,
    color: COLORS.secondary,
    fontSize: 13,
    lineHeight: 21,
    textAlign: "center",
  },

  modalButtons: {
    marginTop: 22,
    width: "100%",
    flexDirection: "row",
    gap: 10,
  },

  modalCancel: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    backgroundColor: COLORS.soft,
    alignItems: "center",
    justifyContent: "center",
  },

  modalCancelText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "800",
  },

  modalConfirm: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    backgroundColor: COLORS.red,
    alignItems: "center",
    justifyContent: "center",
  },

  modalConfirmText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },

  bottomNav: {

    height: 70,
    borderRadius: 0,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    ...cardShadow,
  },

  navItem: {
    flex: 1,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },

  navLabel: {
    color: COLORS.secondary,
    fontSize: 12,
    lineHeight: 13,
  },

  navLabelActive: {
    color: COLORS.red,
    fontWeight: "800",
  },
});