'use client';

import React, { useState, useEffect, useMemo } from 'react';
import type { Membro, AllNVMCAssignments, NVMCDailyAssignments, NVMCParticipantDynamic, NVCVidaCristaDynamicPart } from '@/lib/congregacao/types';
import { NOMES_MESES, DIAS_REUNIAO, NOMES_DIAS_SEMANA_ABREV, NVMC_PART_SECTIONS, NVMC_FIXED_PARTS_CONFIG } from '@/lib/congregacao/constants';
import { formatarDataCompleta, formatarDataParaChave, obterNomeMes, parseNvmcProgramText } from '@/lib/congregacao/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UserPlus, BookUser, Edit3, PlusCircle, Trash2, UploadCloud, Users, FileText } from 'lucide-react';
import { MemberSelectionDialog } from './MemberSelectionDialog';
import { ParseNvmcProgramDialog } from './ParseNvmcProgramDialog';
import { useToast } from "@/hooks/use-toast";
import { generateNvmcPdf } from '@/lib/congregacao/pdf-generator';

interface NvmcAssignmentsCardProps {
  allMembers: Membro[];
  allNvmcAssignments: AllNVMCAssignments | null;
  initialMonth: number; // 0-11
  initialYear: number;
  onSaveNvmcAssignments: (
    updatedMonthAssignments: { [dateStr: string]: NVMCDailyAssignments },
    month: number,
    year: number
  ) => void;
}

interface MemberSelectionContext {
  dateStr: string;
  partKeyOrId: string;
  dynamicPartType?: 'fmm';
  roleInPart?: string;
  currentMemberId: string | null;
  requiredPermissionId: string | null;
  excludedMemberIds: string[];
}

const generatePartId = () => `part_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

export function NvmcAssignmentsCard({
  allMembers,
  allNvmcAssignments,
  initialMonth,
  initialYear,
  onSaveNvmcAssignments,
}: NvmcAssignmentsCardProps) {
  const [displayMonth, setDisplayMonth] = useState<number>(initialMonth ?? new Date().getMonth());
  const [displayYear, setDisplayYear] = useState<number>(initialYear ?? new Date().getFullYear());
  
  const [currentMonthAssignments, setCurrentMonthAssignments] = useState<{ [dateStr: string]: NVMCDailyAssignments }>({});

  const [isMemberSelectionOpen, setIsMemberSelectionOpen] = useState(false);
  const [memberSelectionContext, setMemberSelectionContext] = useState<MemberSelectionContext | null>(null);

  const [isParseProgramDialogOpen, setIsParseProgramDialogOpen] = useState(false);
  const [dateForProgramImport, setDateForProgramImport] = useState<string | null>(null);
  
  const { toast } = useToast();

  const currentYearVal = new Date().getFullYear();
  const yearsForSelect = Array.from({ length: 5 }, (_, i) => currentYearVal - 2 + i);

  const ensureDayAssignmentsStructure = (assignments: NVMCDailyAssignments | undefined): NVMCDailyAssignments => {
    return {
      canticoInicialNumero: assignments?.canticoInicialNumero,
      comentariosIniciaisDetalhes: assignments?.comentariosIniciaisDetalhes,
      presidenteId: assignments?.presidenteId,
      oracaoInicialId: assignments?.oracaoInicialId,
      tesourosDiscursoId: assignments?.tesourosDiscursoId,
      tesourosDiscursoCustomTitle: assignments?.tesourosDiscursoCustomTitle,
      joiasEspirituaisId: assignments?.joiasEspirituaisId,
      joiasEspirituaisCustomTitle: assignments?.joiasEspirituaisCustomTitle,
      leituraBibliaSalaAId: assignments?.leituraBibliaSalaAId,
      leituraBibliaSalaBId: assignments?.leituraBibliaSalaBId,
      leituraBibliaCustomTitle: assignments?.leituraBibliaCustomTitle,
      fmmParts: Array.isArray(assignments?.fmmParts) ? assignments.fmmParts.map(p => ({...p, id: p.id || generatePartId(), partName: p.partName || '', partTheme: p.partTheme, needsAssistant: !!p.needsAssistant, participantSalaAId: p.participantSalaAId, assistantSalaAId: p.assistantSalaAId, participantSalaBId: p.participantSalaBId, assistantSalaBId: p.assistantSalaBId })) : [],
      vidaCristaCantico: assignments?.vidaCristaCantico,
      vidaCristaParts: Array.isArray(assignments?.vidaCristaParts) ? assignments.vidaCristaParts.map(p => ({...p, id: p.id || generatePartId(), partName: p.partName || '', partTheme: p.partTheme, participantId: p.participantId })) : [],
      ebcDirigenteId: assignments?.ebcDirigenteId,
      ebcLeitorId: assignments?.ebcLeitorId,
      ebcCustomTitle: assignments?.ebcCustomTitle,
      comentariosFinaisDetalhes: assignments?.comentariosFinaisDetalhes,
      oracaoFinalId: assignments?.oracaoFinalId,
    };
  };
  
  const midweekMeetingDates = useMemo(() => {
    const dates: Date[] = [];
    const firstDay = new Date(displayYear, displayMonth, 1);
    const lastDayNum = new Date(displayYear, displayMonth + 1, 0).getDate();

    for (let dayNum = 1; dayNum <= lastDayNum; dayNum++) {
      const currentDate = new Date(displayYear, displayMonth, dayNum);
      if (currentDate.getDay() === DIAS_REUNIAO.meioSemana) {
        dates.push(currentDate);
      }
    }
    return dates;
  }, [displayMonth, displayYear]);

  useEffect(() => {
    const yearMonthKey = formatarDataParaChave(new Date(displayYear, displayMonth, 1));
    const loadedAssignments = allNvmcAssignments ? allNvmcAssignments[yearMonthKey] : null;
    
    const newMonthAssignments: { [dateStr: string]: NVMCDailyAssignments } = {};

    midweekMeetingDates.forEach(dateObj => {
      const dateStr = formatarDataCompleta(dateObj);
      const existingAssignmentForDate = loadedAssignments ? loadedAssignments[dateStr] : undefined;
      newMonthAssignments[dateStr] = ensureDayAssignmentsStructure(existingAssignmentForDate);
    });

    setCurrentMonthAssignments(newMonthAssignments);
  }, [displayMonth, displayYear, allNvmcAssignments, midweekMeetingDates]);


  const getMemberName = (memberId: string | null | undefined): string => {
    if (!memberId) return 'Selecionar';
    const member = allMembers.find(m => m.id === memberId);
    return member ? member.nome : 'Desconhecido';
  };
  
  const handleDynamicPartThemeChange = (
    dateStr: string, 
    partType: 'fmm' | 'vc', 
    partId: string, 
    value: string
  ) => {
    setCurrentMonthAssignments(prev => {
      const dayAssignments = ensureDayAssignmentsStructure(prev[dateStr]);
      
      if (partType === 'fmm') {
        const partIndex = dayAssignments.fmmParts.findIndex(p => p.id === partId);
        if (partIndex > -1) {
          dayAssignments.fmmParts[partIndex].partTheme = value;
        }
      } else if (partType === 'vc') {
        const partIndex = dayAssignments.vidaCristaParts.findIndex(p => p.id === partId);
        if (partIndex > -1) {
          dayAssignments.vidaCristaParts[partIndex].partTheme = value;
        }
      }
      return { ...prev, [dateStr]: dayAssignments };
    });
  };
  
  const handleDynamicPartNeedsAssistantChange = (
    dateStr: string,
    partId: string,
    needsAssistant: boolean
  ) => {
     setCurrentMonthAssignments(prev => {
      const dayAssignments = ensureDayAssignmentsStructure(prev[dateStr]);
      const partIndex = dayAssignments.fmmParts.findIndex(p => p.id === partId);
      if (partIndex > -1) {
        dayAssignments.fmmParts[partIndex].needsAssistant = needsAssistant;
        if (!needsAssistant) {
          dayAssignments.fmmParts[partIndex].assistantSalaAId = null; 
          dayAssignments.fmmParts[partIndex].assistantSalaBId = null;
        }
      }
      return { ...prev, [dateStr]: dayAssignments };
    });
  };

  const addDynamicPart = (dateStr: string, partType: 'fmm' | 'vc') => {
    const newPartId = generatePartId();
    setCurrentMonthAssignments(prev => {
      const dayAssignments = ensureDayAssignmentsStructure(prev[dateStr]);
      
      if (partType === 'fmm') {
        dayAssignments.fmmParts = [...dayAssignments.fmmParts, { id: newPartId, partName: 'Nova Parte FMM', partTheme: '', needsAssistant: false, participantSalaAId: null, assistantSalaAId: null, participantSalaBId: null, assistantSalaBId: null }];
      } else if (partType === 'vc') {
        dayAssignments.vidaCristaParts = [...dayAssignments.vidaCristaParts, { id: newPartId, partName: 'Nova Parte Vida Cristã', partTheme: '', participantId: null }];
      }
      return { ...prev, [dateStr]: dayAssignments };
    });
  };

  const removeDynamicPart = (dateStr: string, partType: 'fmm' | 'vc', partId: string) => {
    setCurrentMonthAssignments(prev => {
      const dayAssignments = ensureDayAssignmentsStructure(prev[dateStr]);
      
      if (partType === 'fmm') {
        dayAssignments.fmmParts = dayAssignments.fmmParts.filter(p => p.id !== partId);
      } else if (partType === 'vc') {
        dayAssignments.vidaCristaParts = dayAssignments.vidaCristaParts.filter(p => p.id !== partId);
      }
      return { ...prev, [dateStr]: dayAssignments };
    });
  };
  
  const handleOpenMemberSelection = (
    dateStr: string, 
    partKeyOrId: string, 
    dynamicPartType?: 'fmm',
    roleInPart?: string
  ) => {
    const assignmentsForDay = ensureDayAssignmentsStructure(currentMonthAssignments[dateStr]);
    let currentMemberId: string | null = null;
    let requiredPermissionId: string | null = null;

    const excludedMemberIds: string[] = [];
    // Exclude members assigned to any role in Leitura da Bíblia or FMM parts for this day
    if (assignmentsForDay.leituraBibliaSalaAId) excludedMemberIds.push(assignmentsForDay.leituraBibliaSalaAId);
    if (assignmentsForDay.leituraBibliaSalaBId) excludedMemberIds.push(assignmentsForDay.leituraBibliaSalaBId);
    assignmentsForDay.fmmParts.forEach(p => {
      if (p.participantSalaAId) excludedMemberIds.push(p.participantSalaAId);
      if (p.assistantSalaAId) excludedMemberIds.push(p.assistantSalaAId);
      if (p.participantSalaBId) excludedMemberIds.push(p.participantSalaBId);
      if (p.assistantSalaBId) excludedMemberIds.push(p.assistantSalaBId);
    });
    
    if (dynamicPartType === 'fmm' && roleInPart && 
        (roleInPart === 'participantSalaAId' || roleInPart === 'assistantSalaAId' || roleInPart === 'participantSalaBId' || roleInPart === 'assistantSalaBId') ) {
        const fmmPart = assignmentsForDay.fmmParts.find(p => p.id === partKeyOrId);
        if (fmmPart) {
            currentMemberId = fmmPart[roleInPart as keyof NVMCParticipantDynamic] as string | null;
        }
    } else if (roleInPart && NVMC_FIXED_PARTS_CONFIG[roleInPart]) { 
        currentMemberId = (assignmentsForDay as any)[roleInPart] as string | null;
        requiredPermissionId = NVMC_FIXED_PARTS_CONFIG[roleInPart]?.requiredPermissionId || null;
    } else if (dynamicPartType === undefined && roleInPart && (NVMC_FIXED_PARTS_CONFIG[roleInPart] === undefined)) { 
        const vcPart = assignmentsForDay.vidaCristaParts.find(p => p.id === partKeyOrId);
         if(vcPart && roleInPart === 'participantId') {
            currentMemberId = vcPart?.participantId ?? null;
            const isDirigentePart = vcPart?.partName.toLowerCase().includes("estudo bíblico de congregação");
            requiredPermissionId = isDirigentePart ? 'presidente' : null; 
        } else { 
            currentMemberId = (assignmentsForDay as any)[partKeyOrId] as string | null;
            requiredPermissionId = NVMC_FIXED_PARTS_CONFIG[partKeyOrId]?.requiredPermissionId || null;
        }
    }
    
    setMemberSelectionContext({ 
      dateStr, 
      partKeyOrId, 
      dynamicPartType,
      roleInPart,
      currentMemberId,
      requiredPermissionId,
      excludedMemberIds: Array.from(new Set(excludedMemberIds.filter(id => id !== currentMemberId))) 
    });
    setIsMemberSelectionOpen(true);
  };

 const handleSelectMember = (selectedMemberId: string) => {
    if (!memberSelectionContext) return;
    const { dateStr, partKeyOrId, dynamicPartType, roleInPart } = memberSelectionContext;

    setCurrentMonthAssignments(prev => {
        const dayAssignments = ensureDayAssignmentsStructure(prev[dateStr]);

        if (dynamicPartType === 'fmm' && roleInPart && typeof roleInPart === 'string' && 
            (roleInPart === 'participantSalaAId' || roleInPart === 'assistantSalaAId' || roleInPart === 'participantSalaBId' || roleInPart === 'assistantSalaBId')) {
            const partIndex = dayAssignments.fmmParts.findIndex(p => p.id === partKeyOrId);
            if (partIndex > -1) {
                (dayAssignments.fmmParts[partIndex] as any)[roleInPart as keyof NVMCParticipantDynamic] = selectedMemberId;
            }
        } else if (dynamicPartType === undefined && roleInPart && NVMC_FIXED_PARTS_CONFIG[roleInPart as string]) { 
            (dayAssignments as any)[roleInPart as keyof NVMCDailyAssignments] = selectedMemberId;
        } else if (dynamicPartType === undefined && roleInPart && NVMC_FIXED_PARTS_CONFIG[roleInPart as string] === undefined) { 
            const vcPartIndex = dayAssignments.vidaCristaParts.findIndex(p => p.id === partKeyOrId);
            if (vcPartIndex > -1 && roleInPart === 'participantId') {
                 dayAssignments.vidaCristaParts[vcPartIndex].participantId = selectedMemberId;
            } else if (!dynamicPartType && vcPartIndex === -1 && roleInPart) { 
                 (dayAssignments as any)[partKeyOrId as keyof NVMCDailyAssignments] = selectedMemberId;
            }
        }
        return { ...prev, [dateStr]: dayAssignments };
    });
    
    setIsMemberSelectionOpen(false);
    setMemberSelectionContext(null);
  };
  
  const handleSaveChanges = () => {
    onSaveNvmcAssignments(currentMonthAssignments, displayMonth, displayYear);
  };
  
  const handleExportNvmcPDF = () => {
    if (midweekMeetingDates.length === 0 || Object.keys(currentMonthAssignments).length === 0) {
      toast({
        title: "Sem Dados",
        description: "Não há dados de reunião de meio de semana para exportar para este mês.",
        variant: "default",
      });
      return;
    }
    try {
      generateNvmcPdf(
        currentMonthAssignments,
        allMembers,
        displayMonth,
        displayYear
      );
      toast({ title: "PDF Gerado", description: "O download do PDF deve iniciar em breve." });
    } catch (e: any) {
      console.error("Erro ao gerar PDF:", e);
      toast({ title: "Erro ao Gerar PDF", description: e.message || "Não foi possível gerar o PDF.", variant: "destructive" });
    }
  };

  const handleOpenParseDialog = (dateStr: string) => {
    setDateForProgramImport(dateStr);
    setIsParseProgramDialogOpen(true);
  };

  const handleProgramTextParsed = (text: string) => {
    if (!dateForProgramImport) return;
    
    const parsedProgram = parseNvmcProgramText(text);
    
    setCurrentMonthAssignments(prev => {
      const dayAssignments = ensureDayAssignmentsStructure(prev[dateForProgramImport]);

      dayAssignments.canticoInicialNumero = parsedProgram.canticoInicialNumero;
      dayAssignments.comentariosIniciaisDetalhes = parsedProgram.comentariosIniciaisDetalhes;
      
      dayAssignments.fmmParts = parsedProgram.fmmParts.map(p => ({
        id: generatePartId(),
        partName: p.partName, 
        partTheme: p.partTheme || '', 
        needsAssistant: false, 
        participantSalaAId: null,
        assistantSalaAId: null,
        participantSalaBId: null,
        assistantSalaBId: null,
      }));

      dayAssignments.vidaCristaParts = parsedProgram.vidaCristaParts.map(p => ({
        id: generatePartId(),
        partName: p.partName,
        partTheme: p.partTheme || '',
        participantId: null,
      }));
      dayAssignments.vidaCristaCantico = parsedProgram.vidaCristaCantico;
      
      dayAssignments.leituraBibliaCustomTitle = parsedProgram.leituraBibliaTema;
      dayAssignments.ebcCustomTitle = parsedProgram.ebcTema;
      dayAssignments.tesourosDiscursoCustomTitle = parsedProgram.tesourosDiscursoTema;
      dayAssignments.joiasEspirituaisCustomTitle = parsedProgram.joiasEspirituaisTema;
      dayAssignments.comentariosFinaisDetalhes = parsedProgram.comentariosFinaisDetalhes;

      return { ...prev, [dateForProgramImport]: dayAssignments };
    });

    toast({ title: "Programa Importado", description: `Estrutura da reunião para ${new Date(dateForProgramImport + 'T00:00:00').toLocaleDateString('pt-BR')} foi preenchida. Atribua os membros.`});
    setDateForProgramImport(null);
  };

  const renderFixedPart = (dateStr: string, partKey: keyof NVMCDailyAssignments, config: typeof NVMC_FIXED_PARTS_CONFIG[string]) => {
    const assignmentForDay = ensureDayAssignmentsStructure(currentMonthAssignments[dateStr]);
    const memberId = (assignmentForDay as any)[partKey] as string | null;
    
    let customTitle: string | undefined = undefined;
    if (partKey === 'leituraBibliaSalaAId' || partKey === 'leituraBibliaSalaBId') { 
        customTitle = assignmentForDay.leituraBibliaCustomTitle;
    } else if (partKey === 'ebcDirigenteId' || partKey === 'ebcLeitorId') {
        customTitle = assignmentForDay.ebcCustomTitle;
    } else if (partKey === 'tesourosDiscursoId') {
        customTitle = assignmentForDay.tesourosDiscursoCustomTitle;
    } else if (partKey === 'joiasEspirituaisId') {
        customTitle = assignmentForDay.joiasEspirituaisCustomTitle;
    }

    return (
      <div className="mb-3"> 
        <div className="flex items-center gap-2">
            <Label htmlFor={`${partKey}-${dateStr}`} className="w-2/5 whitespace-nowrap text-sm">{config.label}:</Label>
            <Button variant="outline" size="sm" id={`${partKey}-${dateStr}`} className="flex-1 justify-start text-sm h-9" onClick={() => handleOpenMemberSelection(dateStr, partKey, undefined, partKey as string)}>
            {getMemberName(memberId)}
            </Button>
        </div>
        {customTitle && (
            <p className="text-xs text-muted-foreground mt-1 ml-[calc(40%+0.5rem)]">{customTitle}</p>
        )}
      </div>
    );
  };

  const renderFmmPart = (dateStr: string, part: NVMCParticipantDynamic) => {
    return (
      <div key={part.id} className="space-y-2 mb-4 p-3 border rounded-md bg-muted/20 shadow-sm">
        <div className="flex justify-between items-center mb-1">
            <p className="text-md font-semibold text-primary flex-1 mr-2">{part.partName}</p>
            <Button variant="ghost" size="icon" onClick={() => removeDynamicPart(dateStr, 'fmm', part.id)} className="h-7 w-7 text-destructive">
                <Trash2 className="h-4 w-4" />
            </Button>
        </div>
        <Input
            placeholder="Detalhes, tempo e ref. (ex: (3 min) De casa em casa. (lmd lição 1))"
            value={part.partTheme || ''}
            onChange={(e) => handleDynamicPartThemeChange(dateStr, 'fmm', part.id, e.target.value)}
            className="text-sm flex-1 h-9 mb-2"
        />
        
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground w-36">Participante (Salão P.):</span>
          <Button variant="outline" size="sm" className="flex-1 justify-start text-sm h-9" onClick={() => handleOpenMemberSelection(dateStr, part.id, 'fmm', 'participantSalaAId' as string)}>
            {getMemberName(part.participantSalaAId)}
          </Button>
        </div>
        <div className="flex items-center space-x-2 my-2">
            <Checkbox 
                id={`needsAssistant-${part.id}`} 
                checked={!!part.needsAssistant} 
                onCheckedChange={(checked) => handleDynamicPartNeedsAssistantChange(dateStr, part.id, !!checked)}
            />
            <Label htmlFor={`needsAssistant-${part.id}`} className="text-sm font-normal">Precisa de Ajudante?</Label>
        </div>
        {part.needsAssistant && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground w-36">Ajudante (Salão P.):</span>
            <Button variant="outline" size="sm" className="flex-1 justify-start text-sm h-9" onClick={() => handleOpenMemberSelection(dateStr, part.id, 'fmm', 'assistantSalaAId' as string)}>
              {getMemberName(part.assistantSalaAId)}
            </Button>
          </div>
        )}

        <Separator className="my-3" />
        
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground w-36">Participante (Sala B):</span>
          <Button variant="outline" size="sm" className="flex-1 justify-start text-sm h-9" onClick={() => handleOpenMemberSelection(dateStr, part.id, 'fmm', 'participantSalaBId' as string)}>
            {getMemberName(part.participantSalaBId)}
          </Button>
        </div>
        {part.needsAssistant && (
          <div className="flex items-center gap-2 mt-2">
            <span className="text-sm text-muted-foreground w-36">Ajudante (Sala B):</span>
            <Button variant="outline" size="sm" className="flex-1 justify-start text-sm h-9" onClick={() => handleOpenMemberSelection(dateStr, part.id, 'fmm', 'assistantSalaBId' as string)}>
              {getMemberName(part.assistantSalaBId)}
            </Button>
          </div>
        )}
      </div>
    );
  };

  const renderVidaCristaPart = (dateStr: string, part: NVCVidaCristaDynamicPart) => {
    return (
      <div key={part.id} className="space-y-2 mb-3 p-3 border rounded-md bg-muted/20 shadow-sm">
        <div className="flex justify-between items-center mb-1">
             <p className="text-md font-semibold text-primary flex-1 mr-2">{part.partName}</p>
             <Button variant="ghost" size="icon" onClick={() => removeDynamicPart(dateStr, 'vc', part.id)} className="h-7 w-7 text-destructive">
                <Trash2 className="h-4 w-4" />
            </Button>
        </div>
         <Input
            placeholder="Detalhes e tempo (ex: (15 min) Necessidades locais. (Carta da filial))"
            value={part.partTheme || ''}
            onChange={(e) => handleDynamicPartThemeChange(dateStr, 'vc', part.id, e.target.value)}
            className="text-sm flex-1 h-9 mb-2"
        />
        <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground w-24">Designado:</span>
            <Button variant="outline" size="sm" className="flex-1 justify-start text-sm h-9" onClick={() => handleOpenMemberSelection(dateStr, part.id, undefined, 'participantId' as string)}>
                {getMemberName(part.participantId)}
            </Button>
        </div>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <BookUser className="mr-2 h-5 w-5 text-primary" /> Designações NVMC (Vida e Ministério)
        </CardTitle>
        <CardDescription>
          Configure as designações para a reunião de meio de semana de {obterNomeMes(displayMonth)} de {displayYear}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-col sm:flex-row gap-4 mb-6 items-end">
          <div className="flex-1">
            <Label htmlFor={`selectNvmcMes-${initialYear}-${initialMonth}`}>Mês</Label>
            <Select value={displayMonth.toString()} onValueChange={(val) => setDisplayMonth(parseInt(val))}>
              <SelectTrigger id={`selectNvmcMes-${initialYear}-${initialMonth}`}>
                <SelectValue placeholder="Selecione o mês" />
              </SelectTrigger>
              <SelectContent>
                {NOMES_MESES.map((nome, index) => (
                  <SelectItem key={index} value={index.toString()}>{nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1">
            <Label htmlFor={`selectNvmcAno-${initialYear}-${initialMonth}`}>Ano</Label>
            <Select value={displayYear.toString()} onValueChange={(val) => setDisplayYear(parseInt(val))}>
              <SelectTrigger id={`selectNvmcAno-${initialYear}-${initialMonth}`}>
                <SelectValue placeholder="Ano" />
              </SelectTrigger>
              <SelectContent>
                {yearsForSelect.map(yearVal => (
                  <SelectItem key={yearVal} value={yearVal.toString()}>{yearVal}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
           <Button onClick={handleSaveChanges} className="w-full sm:w-auto">
            Salvar Alterações de {obterNomeMes(displayMonth)}
          </Button>
        </div>

        {midweekMeetingDates.length === 0 && (
           <p className="text-muted-foreground text-center py-4">
            Nenhuma reunião de meio de semana em {obterNomeMes(displayMonth)} de {displayYear}.
          </p>
        )}

        {midweekMeetingDates.map((dateObj, index) => {
          const dateStr = formatarDataCompleta(dateObj);
          const dayAbrev = NOMES_DIAS_SEMANA_ABREV[dateObj.getUTCDay()];
          const formattedDateDisplay = `${dayAbrev} ${dateObj.getUTCDate().toString().padStart(2, '0')}/${(dateObj.getUTCMonth() + 1).toString().padStart(2, '0')}`;
          const dailyAssignments = ensureDayAssignmentsStructure(currentMonthAssignments[dateStr]);
          
          return (
            <div key={dateStr} className="mb-6">
              <div className="flex justify-between items-center mb-3 sticky top-0 bg-background py-2 z-10 border-b">
                <h3 className="text-xl font-semibold text-primary">
                    {formattedDateDisplay} - {obterNomeMes(dateObj.getUTCMonth())} de {dateObj.getUTCFullYear()}
                </h3>
                <Button variant="outline" size="sm" onClick={() => handleOpenParseDialog(dateStr)}>
                    <UploadCloud className="mr-2 h-4 w-4" /> Importar Programa (Texto)
                </Button>
              </div>
              <div className="space-y-6"> 
                
                <div className="border rounded-lg p-4 shadow-sm">
                  <h4 className="text-md font-medium text-foreground mb-2 mt-1 uppercase">{NVMC_PART_SECTIONS.CANTICO_E_ORACAO_INICIAL}</h4>
                  {dailyAssignments.canticoInicialNumero && (
                    <p className="text-sm text-muted-foreground mt-1 mb-3 ml-1 pl-1">
                      {dailyAssignments.canticoInicialNumero}
                    </p>
                  )}
                  {renderFixedPart(dateStr, 'presidenteId', NVMC_FIXED_PARTS_CONFIG.presidenteId)}
                  {renderFixedPart(dateStr, 'oracaoInicialId', NVMC_FIXED_PARTS_CONFIG.oracaoInicialId)}
                   {dailyAssignments.comentariosIniciaisDetalhes && (
                    <p className="text-sm text-muted-foreground mt-3 mb-1 ml-1 pl-1">
                      {dailyAssignments.comentariosIniciaisDetalhes} | Comentários Iniciais
                    </p>
                  )}
                </div>

                <div className="border rounded-lg p-4 shadow-sm">
                  <h4 className="text-md font-medium text-foreground mb-2 mt-1 uppercase">{NVMC_PART_SECTIONS.TESOUROS_DA_PALAVRA_DE_DEUS}</h4>
                  {renderFixedPart(dateStr, 'tesourosDiscursoId', NVMC_FIXED_PARTS_CONFIG.tesourosDiscursoId)}
                  {renderFixedPart(dateStr, 'joiasEspirituaisId', NVMC_FIXED_PARTS_CONFIG.joiasEspirituaisId)}
                  {renderFixedPart(dateStr, 'leituraBibliaSalaAId', NVMC_FIXED_PARTS_CONFIG.leituraBibliaSalaAId)}
                  {renderFixedPart(dateStr, 'leituraBibliaSalaBId', NVMC_FIXED_PARTS_CONFIG.leituraBibliaSalaBId)}
                </div>

                <div className="border rounded-lg p-4 shadow-sm">
                  <h4 className="text-md font-medium text-foreground mb-3 mt-1 uppercase">{NVMC_PART_SECTIONS.FACA_SEU_MELHOR_NO_MINISTERIO}</h4>
                  {dailyAssignments.fmmParts.map(part => renderFmmPart(dateStr, part))}
                  <Button variant="outline" size="sm" onClick={() => addDynamicPart(dateStr, 'fmm')} className="mt-3">
                    <PlusCircle className="mr-2 h-4 w-4" /> Adicionar Parte (FMM)
                  </Button>
                </div>

                <div className="border rounded-lg p-4 shadow-sm">
                  <h4 className="text-md font-medium text-foreground mb-3 mt-1 uppercase">{NVMC_PART_SECTIONS.NOSSA_VIDA_CRISTA}</h4>
                   {dailyAssignments.vidaCristaParts.map(part => renderVidaCristaPart(dateStr, part))}
                   {dailyAssignments.vidaCristaCantico && (
                     <p className="text-sm text-muted-foreground mt-4 mb-3 ml-1 pl-1"> 
                      {dailyAssignments.vidaCristaCantico}
                    </p>
                  )}
                   <Button variant="outline" size="sm" onClick={() => addDynamicPart(dateStr, 'vc')} className="mt-3">
                    <PlusCircle className="mr-2 h-4 w-4" /> Adicionar Parte (Vida Cristã)
                  </Button>
                  <Separator className="my-4" />
                  {renderFixedPart(dateStr, 'ebcDirigenteId', NVMC_FIXED_PARTS_CONFIG.ebcDirigenteId)}
                  {renderFixedPart(dateStr, 'ebcLeitorId', NVMC_FIXED_PARTS_CONFIG.ebcLeitorId)}
                </div>
                
                 <div className="border rounded-lg p-4 shadow-sm">
                  <h4 className="text-md font-medium text-foreground mb-2 mt-1 uppercase">{NVMC_PART_SECTIONS.COMENTARIOS_FINAIS}</h4>
                  {dailyAssignments.comentariosFinaisDetalhes && (
                    <p className="text-sm text-muted-foreground mb-3 ml-1 pl-1">{dailyAssignments.comentariosFinaisDetalhes}</p>
                  )}
                  {renderFixedPart(dateStr, 'oracaoFinalId', NVMC_FIXED_PARTS_CONFIG.oracaoFinalId)}
                </div>
              </div>
              {index < midweekMeetingDates.length - 1 && <Separator className="my-8" />}
            </div>
          );
        })}
         {midweekMeetingDates.length > 0 && (
            <div className="mt-8 flex justify-end">
                <Button variant="outline" onClick={handleExportNvmcPDF} className="w-full sm:w-auto">
                    <FileText className="mr-2 h-4 w-4" />
                    Exportar como PDF
                </Button>
            </div>
        )}
      </CardContent>

      {memberSelectionContext && isMemberSelectionOpen && (
        <MemberSelectionDialog
          isOpen={isMemberSelectionOpen}
          onOpenChange={setIsMemberSelectionOpen}
          allMembers={allMembers}
          targetRole={null} 
          requiredPermissionId={memberSelectionContext.requiredPermissionId}
          currentDate={memberSelectionContext.dateStr}
          onSelectMember={handleSelectMember}
          currentlyAssignedMemberId={memberSelectionContext.currentMemberId}
          excludedMemberId={null} 
          excludedMemberIds={memberSelectionContext.excludedMemberIds}
          dialogTitle={
             memberSelectionContext.dynamicPartType === 'fmm' && currentMonthAssignments[memberSelectionContext.dateStr] ?
               (
                currentMonthAssignments[memberSelectionContext.dateStr]?.fmmParts.find(p => p.id === memberSelectionContext.partKeyOrId)?.partName + 
                ( (memberSelectionContext.roleInPart as string)?.includes('SalaA') ? ' (Salão P.)' : ((memberSelectionContext.roleInPart as string)?.includes('SalaB') ? ' (Sala B)' : '') ) +
                ( (memberSelectionContext.roleInPart as string)?.includes('assistant') ? ' - Ajudante' : ((memberSelectionContext.roleInPart as string)?.includes('participant') ? ' - Participante' : '') ) 
               ) || 'Participante'
             : NVMC_FIXED_PARTS_CONFIG[memberSelectionContext.partKeyOrId as string]?.label || 
               currentMonthAssignments[memberSelectionContext.dateStr]?.vidaCristaParts.find(p => p.id === memberSelectionContext.partKeyOrId)?.partName ||
               'Participante'
          }
          dialogDescription={
            (() => {
              if (!memberSelectionContext) return "Selecione um membro.";
              const assignmentsForDate = currentMonthAssignments[memberSelectionContext.dateStr];
              if (!assignmentsForDate) return "Carregando detalhes da designação...";

              const { partKeyOrId, dynamicPartType } = memberSelectionContext;

              if (dynamicPartType === 'fmm') {
                return assignmentsForDate.fmmParts.find(p => p.id === partKeyOrId)?.partTheme;
              }
              
              if (NVMC_FIXED_PARTS_CONFIG[partKeyOrId as string]) {
                const pk = partKeyOrId as keyof NVMCDailyAssignments; // Use type assertion
                switch (pk) {
                  case 'tesourosDiscursoId':
                    return assignmentsForDate.tesourosDiscursoCustomTitle;
                  case 'joiasEspirituaisId':
                    return assignmentsForDate.joiasEspirituaisCustomTitle;
                  case 'leituraBibliaSalaAId':
                  case 'leituraBibliaSalaBId':
                    return assignmentsForDate.leituraBibliaCustomTitle;
                  case 'ebcDirigenteId':
                  case 'ebcLeitorId':
                    return assignmentsForDate.ebcCustomTitle;
                  default:
                    return undefined; 
                }
              }
              
              const vcPart = assignmentsForDate.vidaCristaParts.find(p => p.id === partKeyOrId);
              if (vcPart) {
                return vcPart.partTheme;
              }
              
              return undefined; 
            })() || `Selecione um membro para esta função.`
          }
        />
      )}
      {isParseProgramDialogOpen && dateForProgramImport && (
        <ParseNvmcProgramDialog
          isOpen={isParseProgramDialogOpen}
          onOpenChange={setIsParseProgramDialogOpen}
          onParseText={handleProgramTextParsed}
          currentMeetingDate={dateForProgramImport}
        />
      )}
    </Card>
  );
}
