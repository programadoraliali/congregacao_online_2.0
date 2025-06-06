'use server'; 

import type { Membro, FuncaoDesignada, DesignacoesFeitas, DiasReuniao } from './types';
import { FUNCOES_DESIGNADAS, DIAS_REUNIAO as DIAS_REUNIAO_CONFIG } from './constants';
import { formatarDataCompleta, getPermissaoRequerida } from './utils';


// --- Funções Auxiliares de Elegibilidade e Priorização (Refatoradas e Exportadas) ---

// Get IDs of all AV functions dynamically
const AV_FUNCTION_IDS = FUNCOES_DESIGNADAS.filter(f => f.tabela === 'AV').map(f => f.id);

function encontrarDataReuniaoAnterior(
  dataAtual: Date,
  tipoReuniaoAtual: 'meioSemana' | 'publica',
  datasDeReuniaoNoMes: Date[],
  DIAS_REUNIAO: DiasReuniao
): Date | null {
  const diaSemanaAlvo = tipoReuniaoAtual === 'meioSemana' ? DIAS_REUNIAO.meioSemana : DIAS_REUNIAO.publica;
  let dataAnterior: Date | null = null;
  for (const dataCand of datasDeReuniaoNoMes) {
    if (dataCand < dataAtual && dataCand.getDay() === diaSemanaAlvo) {
      if (dataAnterior === null || dataCand > dataAnterior) {
        dataAnterior = new Date(dataCand);
      }
    }
  }
  return dataAnterior;
}

function encontrarDataReuniaoImediataAnterior(
  dataAtualStr: string,
  datasDeReuniaoNoMesStr: string[]
): string | null {
  const indexAtual = datasDeReuniaoNoMesStr.indexOf(dataAtualStr);
  if (indexAtual > 0) {
    return datasDeReuniaoNoMesStr[indexAtual - 1];
  }
  return null;
}

function fezFuncaoNaReuniaoAnterior(
  membroId: string,
  funcaoId: string,
  dataReuniaoAnteriorStr: string | null,
  designacoesFeitasNoMesAtual: DesignacoesFeitas
): boolean {
  if (!dataReuniaoAnteriorStr) return false;
  const designacoesDoDiaAnterior = designacoesFeitasNoMesAtual[dataReuniaoAnteriorStr];
  if (!designacoesDoDiaAnterior) return false;
  
  // Check if the member had the EXACT same function in the previous meeting
  // OR, for AV functions, if they had ANY AV function in the previous meeting
  const isAVFunction = AV_FUNCTION_IDS.includes(funcaoId);

  if (isAVFunction) {
    // Para funções AV, verifica se o membro fez QUALQUER função AV na reunião anterior
    return AV_FUNCTION_IDS.some(avFuncId => designacoesDoDiaAnterior[avFuncId] === membroId);
  } else {
    return designacoesDoDiaAnterior[funcaoId] === membroId;
  }
}

function contarUsoFuncaoNoMes(
  membroId: string,
  funcaoId: string,
  designacoesFeitasNoMesAtual: DesignacoesFeitas,
  dataAtualStr: string,
  ignorarDataAtual: boolean = true // Se true, não conta a designação da dataAtualStr
): number {
  let count = 0;
  for (const dataStr in designacoesFeitasNoMesAtual) {
    if (ignorarDataAtual && dataStr >= dataAtualStr) continue;
    const funcoesDoDia = designacoesFeitasNoMesAtual[dataStr];
    if (funcoesDoDia && funcoesDoDia[funcaoId] === membroId) {
      count++;
    }
  }
  return count;
}

function contarUsoGeralNoMes(
  membroId: string,
  designacoesFeitasNoMesAtual: DesignacoesFeitas,
  dataAtualStr: string,
  ignorarDataAtual: boolean = true // Se true, não conta a designação da dataAtualStr
): number {
  let count = 0;
  for (const dataStr in designacoesFeitasNoMesAtual) {
    if (ignorarDataAtual && dataStr >= dataAtualStr) continue;
    const funcoesDoDia = designacoesFeitasNoMesAtual[dataStr];
    if (funcoesDoDia) {
      for (const funcId in funcoesDoDia) {
        if (funcoesDoDia[funcId] === membroId) {
          count++;
        }
      }
    }
  }
  return count;
}

function contarUsoFuncaoNoHistorico(
  membroId: string,
  funcaoId: string,
  membro: Membro
): number {
  let count = 0;
  for (const dataStr in membro.historicoDesignacoes) {
    if (membro.historicoDesignacoes[dataStr] === funcaoId) {
      count++;
    }
  }
  return count;
}

function getDataUltimaVezFuncao(
  membroId: string,
  funcaoId: string,
  membro: Membro
): string | null {
  let ultimaData: string | null = null;
  for (const dataStr in membro.historicoDesignacoes) {
    if (membro.historicoDesignacoes[dataStr] === funcaoId) {
      if (ultimaData === null || dataStr > ultimaData) {
        ultimaData = dataStr;
      }
    }
  }
  return ultimaData;
}

export async function getEligibleMembersForFunctionDate(
  funcao: FuncaoDesignada,
  dataReuniao: Date,
  dataReuniaoStr: string,
  todosMembros: Membro[],
  designacoesNoDia: Record<string, string | null> = {}, 
  membroExcluidoId?: string | null, 
  designacoesFeitasNoMesAtual?: DesignacoesFeitas,
  allMeetingDatesStr?: string[] 
): Promise<Membro[]> {
  const tipoReuniao = dataReuniao.getDay() === DIAS_REUNIAO_CONFIG.meioSemana ? 'meioSemana' : 'publica';
  const membrosDesignadosNesteDia = new Set(Object.values(designacoesNoDia).filter(id => id !== null) as string[]);

  let dataReuniaoImediataAnteriorStr = null;
   if (allMeetingDatesStr) {
     dataReuniaoImediataAnteriorStr = encontrarDataReuniaoImediataAnterior(dataReuniaoStr, allMeetingDatesStr);
   }

  const isAVFunction = AV_FUNCTION_IDS.includes(funcao.id);

  const elegiveisBasico = todosMembros.filter(membro => {
    if (membroExcluidoId && membro.id === membroExcluidoId) {
      return false;
    }

    const permissaoNecessariaId = getPermissaoRequerida(funcao.id, tipoReuniao);
    if (!permissaoNecessariaId || !membro.permissoesBase[permissaoNecessariaId]) {
      return false;
    }

    if (membro.impedimentos.some(imp => dataReuniaoStr >= imp.from && dataReuniaoStr <= imp.to)) {
      return false;
    }

    if (membrosDesignadosNesteDia.has(membro.id)) {
      return false;
    }
    return true; // Member passes basic eligibility
  });

  // Aplicar a regra de Prioridade 1 como filtro ABSOLUTO para AVs se houver alternativa elegível GERAL
  if (isAVFunction && dataReuniaoImediataAnteriorStr && designacoesFeitasNoMesAtual) {
      // Primeiro, encontre todos os membros que não fizeram AV na reunião anterior
      const todosQueNaoFizeramAVNaAnterior = todosMembros.filter(membro =>
          !fezFuncaoNaReuniaoAnterior(membro.id, funcao.id, dataReuniaoImediataAnteriorStr, designacoesFeitasNoMesAtual)
      );

      // Agora, filtre esta lista pelos critérios básicos de elegibilidade
      const elegiveisQueNaoFizeramAVNaAnteriorEBasico = todosQueNaoFizeramAVNaAnterior.filter(membro =>
          // Replicar a lógica de filtro básico aqui
          !(membroExcluidoId && membro.id === membroExcluidoId) &&
          !!(getPermissaoRequerida(funcao.id, tipoReuniao) && membro.permissoesBase[getPermissaoRequerida(funcao.id, tipoReuniao)!]) &&
          !membro.impedimentos.some(imp => dataReuniaoStr >= imp.from && dataReuniaoStr <= imp.to) &&
          !membrosDesignadosNesteDia.has(membro.id)
      );


      if (elegiveisQueNaoFizeramAVNaAnteriorEBasico.length > 0) {
          // Se houver pelo menos um membro elegível GERALMENTe que NÃO fez AV na reunião anterior,
          // APENAS esses membros são considerados elegíveis para esta designação AV.
          return elegiveisQueNaoFizeramAVNaAnteriorEBasico;
      } else {
          // Se NENHUM membro elegível GERALMENTE que NÃO fez AV na reunião anterior foi encontrado,
          // então não podemos evitar a repetição imediata com base nesta regra.
          // Retornamos a lista básica completa (que só contém repetidores AV neste ponto),
          // e a priorização ocorrerá com base nas outras regras.
          return elegiveisBasico;
      }

  } else {
    // Para funções não AV ou se não há dados da reunião anterior,
    // a elegibilidade básica é suficiente.
    return elegiveisBasico;
  }
}

export async function sortMembersByPriority(
  membrosElegiveis: Membro[],
  funcao: FuncaoDesignada,
  designacoesFeitasNoMesAtual: DesignacoesFeitas,
  dataReuniaoStr: string,
  membrosComHistoricoCompleto: Membro[], // Para acessar o histórico original completo
  allMeetingDatesStr?: string[] // Adicionado para encontrar a reunião imediatamente anterior
): Promise<Membro[]> {
  
  const membrosOrdenados = [...membrosElegiveis];

  // Encontrar a data da reunião imediatamente anterior
  let dataReuniaoImediataAnteriorStr = null;
  if (allMeetingDatesStr) {
    dataReuniaoImediataAnteriorStr = encontrarDataReuniaoImediataAnterior(dataReuniaoStr, allMeetingDatesStr);
  }

  membrosOrdenados.sort((membroA, membroB) => {
    // Prioridade 1: Anti-Repetição Imediata - Usar a reunião imediatamente anterior
    const fezAFuncaoAnterior = fezFuncaoNaReuniaoAnterior(membroA.id, funcao.id, dataReuniaoImediataAnteriorStr, designacoesFeitasNoMesAtual);
    const fezBFuncaoAnterior = fezFuncaoNaReuniaoAnterior(membroB.id, funcao.id, dataReuniaoImediataAnteriorStr, designacoesFeitasNoMesAtual);
    if (fezAFuncaoAnterior && !fezBFuncaoAnterior) return 1; 
    if (!fezAFuncaoAnterior && fezBFuncaoAnterior) return -1;

    const usoFuncaoMesA = contarUsoFuncaoNoMes(membroA.id, funcao.id, designacoesFeitasNoMesAtual, dataReuniaoStr);
    const usoFuncaoMesB = contarUsoFuncaoNoMes(membroB.id, funcao.id, designacoesFeitasNoMesAtual, dataReuniaoStr);
    if (usoFuncaoMesA !== usoFuncaoMesB) return usoFuncaoMesA - usoFuncaoMesB;

    const usoGeralMesA = contarUsoGeralNoMes(membroA.id, designacoesFeitasNoMesAtual, dataReuniaoStr);
    const usoGeralMesB = contarUsoGeralNoMes(membroB.id, designacoesFeitasNoMesAtual, dataReuniaoStr);
    if (usoGeralMesA !== usoGeralMesB) return usoGeralMesA - usoGeralMesB;
    
    const membroOriginalA = membrosComHistoricoCompleto.find(m => m.id === membroA.id)!;
    const membroOriginalB = membrosComHistoricoCompleto.find(m => m.id === membroB.id)!;

    const usoFuncaoHistA = contarUsoFuncaoNoHistorico(membroA.id, funcao.id, membroOriginalA);
    const usoFuncaoHistB = contarUsoFuncaoNoHistorico(membroB.id, funcao.id, membroOriginalB);
    if (usoFuncaoHistA !== usoFuncaoHistB) return usoFuncaoHistA - usoFuncaoHistB;

    const ultimaVezA = getDataUltimaVezFuncao(membroA.id, funcao.id, membroOriginalA);
    const ultimaVezB = getDataUltimaVezFuncao(membroB.id, funcao.id, membroOriginalB);

    if (ultimaVezA === null && ultimaVezB !== null) return -1;
    if (ultimaVezA !== null && ultimaVezB === null) return 1;
    if (ultimaVezA && ultimaVezB && ultimaVezA !== ultimaVezB) {
      return ultimaVezA.localeCompare(ultimaVezB);
    }
    
    return Math.random() - 0.5;
  });
  return membrosOrdenados;
}

// --- Lógica Principal de Geração ---
export async function calcularDesignacoesAction(
  mes: number, // 0-11
  ano: number,
  membros: Membro[] 
): Promise<{ designacoesFeitas: DesignacoesFeitas } | { error: string }> {
  
  const DIAS_REUNIAO: DiasReuniao = DIAS_REUNIAO_CONFIG;
  const designacoesFeitasNoMesAtual: DesignacoesFeitas = {};
  const membrosDisponiveis = JSON.parse(JSON.stringify(membros)) as Membro[]; 

  const datasDeReuniaoNoMes: Date[] = [];
  const primeiroDiaDoMes = new Date(Date.UTC(ano, mes, 1));
  const ultimoDiaDoMes = new Date(Date.UTC(ano, mes + 1, 0));

  for (let dia = new Date(primeiroDiaDoMes); dia <= ultimoDiaDoMes; dia.setDate(dia.getDate() + 1)) {
    const diaDaSemana = dia.getDay();
    if (diaDaSemana === DIAS_REUNIAO.meioSemana || diaDaSemana === DIAS_REUNIAO.publica) {
      datasDeReuniaoNoMes.push(new Date(dia));
    }
  }

  if (datasDeReuniaoNoMes.length === 0) {
    return { error: "Nenhuma data de reunião encontrada para este mês." };
  }
  datasDeReuniaoNoMes.sort((a, b) => a.getTime() - b.getTime());
  
  // Get all meeting dates as strings for easy lookup
  const allMeetingDatesStr = datasDeReuniaoNoMes.map(d => formatarDataCompleta(d));

  for (const dataReuniao of datasDeReuniaoNoMes) {
    const dataReuniaoStr = formatarDataCompleta(dataReuniao);
    designacoesFeitasNoMesAtual[dataReuniaoStr] = {
      ...designacoesFeitasNoMesAtual[dataReuniaoStr], // Preserve existing if any (from cache)
      limpezaAposReuniaoGrupoId: designacoesFeitasNoMesAtual[dataReuniaoStr]?.limpezaAposReuniaoGrupoId || null,
      limpezaSemanalResponsavel: designacoesFeitasNoMesAtual[dataReuniaoStr]?.limpezaSemanalResponsavel || '',
    };
    
    const tipoReuniaoAtual = dataReuniao.getDay() === DIAS_REUNIAO.meioSemana ? 'meioSemana' : 'publica';
    
    const funcoesParaGeracaoAutomatica = FUNCOES_DESIGNADAS.filter(
      f => f.tipoReuniao.includes(tipoReuniaoAtual)
    );
    
    const dataReuniaoAnteriorObj = encontrarDataReuniaoAnterior(dataReuniao, tipoReuniaoAtual, datasDeReuniaoNoMes, DIAS_REUNIAO);
    const dataReuniaoAnteriorStr = dataReuniaoAnteriorObj ? formatarDataCompleta(dataReuniaoAnteriorObj) : null;

    for (const funcao of funcoesParaGeracaoAutomatica) {
      // Filter out undefined values for type compatibility
      const assignmentsForDay: Record<string, string | null> = {};
      Object.entries(designacoesFeitasNoMesAtual[dataReuniaoStr] || {}).forEach(([k, v]) => {
        if (v !== undefined) assignmentsForDay[k] = v === undefined ? null : v;
      });
      const membrosElegiveis = await getEligibleMembersForFunctionDate(
        funcao,
        dataReuniao,
        dataReuniaoStr,
        membrosDisponiveis,
        assignmentsForDay,
        undefined,
        designacoesFeitasNoMesAtual,
        allMeetingDatesStr
      );

      if (membrosElegiveis.length === 0) {
        if (!designacoesFeitasNoMesAtual[dataReuniaoStr][funcao.id]) { // Only set to null if not already set (from cache)
            designacoesFeitasNoMesAtual[dataReuniaoStr][funcao.id] = null;
        }
        continue;
      }

      const membrosOrdenados = await sortMembersByPriority(
        membrosElegiveis,
        funcao,
        designacoesFeitasNoMesAtual,
        dataReuniaoStr,
        membros,
        allMeetingDatesStr
      );

      const membroEscolhido = membrosOrdenados[0];
      if (membroEscolhido) {
         if (!designacoesFeitasNoMesAtual[dataReuniaoStr][funcao.id]) {
            designacoesFeitasNoMesAtual[dataReuniaoStr][funcao.id] = membroEscolhido.id;
         }
      } else {
         if (!designacoesFeitasNoMesAtual[dataReuniaoStr][funcao.id]) {
            designacoesFeitasNoMesAtual[dataReuniaoStr][funcao.id] = null;
         }
      }
    }
  }
  
  return { designacoesFeitas: designacoesFeitasNoMesAtual };
}


// --- Funções para Lógica de Substituição ---

export async function findNextBestCandidateForSubstitution(
  dateStr: string,
  functionId: string,
  originalMemberId: string,
  allMembers: Membro[],
  currentAssignmentsForMonth: DesignacoesFeitas,
  allMeetingDatesStr: string[]
): Promise<Membro | null> {
  const targetDate = new Date(dateStr + "T00:00:00"); 
  const targetFunction = FUNCOES_DESIGNADAS.find(f => f.id === functionId);

  if (!targetFunction) return null;

  const assignmentsOnTargetDate: Record<string, string | null> = {};
  Object.entries(currentAssignmentsForMonth[dateStr] || {}).forEach(([k, v]) => {
    if (v !== undefined) assignmentsOnTargetDate[k] = v === undefined ? null : v;
  });
  
  const datasDeReuniaoNoMesFicticia : Date[] = allMeetingDatesStr
    .map(d => new Date(d + "T00:00:00"))
    .sort((a,b) => a.getTime() - b.getTime());
  
  const tipoReuniaoAtual = targetDate.getDay() === DIAS_REUNIAO_CONFIG.meioSemana ? 'meioSemana' : 'publica';
  const dataReuniaoAnteriorObj = encontrarDataReuniaoAnterior(targetDate, tipoReuniaoAtual, datasDeReuniaoNoMesFicticia, DIAS_REUNIAO_CONFIG);
  const dataReuniaoAnteriorStr = dataReuniaoAnteriorObj ? formatarDataCompleta(dataReuniaoAnteriorObj) : null;


  const eligibleMembers = await getEligibleMembersForFunctionDate(
    targetFunction,
    targetDate,
    dateStr,
    allMembers,
    assignmentsOnTargetDate,
    undefined,
    currentAssignmentsForMonth,
    allMeetingDatesStr
  );

  if (eligibleMembers.length === 0) return null;

  const sortedMembers = await sortMembersByPriority(
    eligibleMembers,
    targetFunction,
    currentAssignmentsForMonth,
    dateStr,
    allMembers,
    allMeetingDatesStr
  );
  
  return sortedMembers.length > 0 ? sortedMembers[0] : null;
}

export async function getPotentialSubstitutesList(
  dateStr: string,
  functionId: string,
  originalMemberId: string,
  allMembers: Membro[],
  currentAssignmentsForMonth: DesignacoesFeitas,
  allMeetingDatesStr: string[]
): Promise<Membro[]> {
  const targetDate = new Date(dateStr + "T00:00:00");
  const targetFunction = FUNCOES_DESIGNADAS.find(f => f.id === functionId);

  if (!targetFunction) return [];

  const assignmentsOnTargetDate: Record<string, string | null> = {};
  Object.entries(currentAssignmentsForMonth[dateStr] || {}).forEach(([k, v]) => {
    if (v !== undefined) assignmentsOnTargetDate[k] = v === undefined ? null : v;
  });
  
  const datasDeReuniaoNoMesFicticia : Date[] = allMeetingDatesStr
    .map(d => new Date(d + "T00:00:00"))
    .sort((a,b) => a.getTime() - b.getTime());
  
  const tipoReuniaoAtual = targetDate.getDay() === DIAS_REUNIAO_CONFIG.meioSemana ? 'meioSemana' : 'publica';
  const dataReuniaoAnteriorObj = encontrarDataReuniaoAnterior(targetDate, tipoReuniaoAtual, datasDeReuniaoNoMesFicticia, DIAS_REUNIAO_CONFIG);
  const dataReuniaoAnteriorStr = dataReuniaoAnteriorObj ? formatarDataCompleta(dataReuniaoAnteriorObj) : null;


  const eligibleMembers = await getEligibleMembersForFunctionDate(
    targetFunction,
    targetDate,
    dateStr,
    allMembers,
    assignmentsOnTargetDate,
    undefined,
    currentAssignmentsForMonth,
    allMeetingDatesStr
  );

  return eligibleMembers.sort((a, b) => a.nome.localeCompare(b.nome));
}
