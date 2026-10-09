import api from "./api";

// ✅ endpoint en BTP: POST /api/formulario-riesgos
export const guardarFormularioRiesgos = async (payload) => {
  const res = await api.post("/formulario-riesgos", payload);
  return res.data;
};
