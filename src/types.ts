/**
 * Tipos para o Gotas de Cuidado: Monitoramento de Crianças e Adolescentes com Diabetes e Anemia Falciforme.
 * Espelha schema da collection gotas_de_cuidado_pacientes no PocketBase.
 */

/** Registro completo da collection gotas_de_cuidado_pacientes */
export interface Paciente {
  id: string;
  unidade: string;
  paciente: string;          // nome do paciente
  sexo: string;              // M / F
  raca: string;              // cor/raça
  idade: number;             // idade atual
  data_de_nascimento: string; // data de nascimento (YYYY-MM-DD)
  equipe: string;
  microarea: string;
  data_ultima_cons_dentista: string; // data ultima consulta dentista
  classificacao: string;     // classificação do paciente
  unidade_escolar: string;
  estado_nutricional: string;
  recebe_beneficio: string;  // recebe algum benefício?
  situacao_vacinal: string;  // situação vacinal
  observacoes: string;       // observações
  unidade_especializada: string;
  collectionId?: string;
  collectionName?: string;
  created?: string;
  updated?: string;
}

/** Tipo auxiliar para pagina de resumo */
export type CategoriaPaciente = "diabetes" | "anemia_falciforme";

export type MetaDirection = "diminuir" | "zerar" | "monitorar" | "aumentar";

export interface CardCategoria {
  categoria: CategoriaPaciente;
  titulo: string;
  meta: MetaDirection;
  valor: number;
  percentual: number;
  corBorda: string;
  corBadge: string;
  corBarra: string;
  comBusca?: number;
  semBusca?: number;
}

/** Registro de acompanhamento (follow-up) do paciente */
export interface Acompanhamento {
  id: string;
  paciente_id: string;
  usuario_id: string;
  data_da_busca: string;
  tipo_busca: string;
  tipo_contato: string;
  entrave_informado_por: string;
  situacao_pos_busca: string;
  entraves_identificados: string;
  observacoes: string;
  created?: string;
  updated?: string;
}
