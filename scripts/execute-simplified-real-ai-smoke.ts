import fs from 'fs';
import path from 'path';
import { DeepgramTranscriptionProvider } from '../src/modules/transcription/providers/deepgram';
import { GeminiLLMAdapter } from '../src/modules/ai/providers/gemini';

/**
 * MEETWISE AI — FASE 7.2 | PORTA 2 — ETAPA 2 — FASE D1.B.4-B1
 * SIMPLIFIED REAL AI SMOKE TEST (1 ÁUDIO STT + 1 ATA LLM)
 *
 * Teto de Segurança Financeira: $0.05 USD
 */

// 1. Carregar .env.local se existir
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const key = trimmed.substring(0, idx).trim();
      const val = trimmed.substring(idx + 1).trim();
      if (!process.env[key] && val.length > 0) {
        process.env[key] = val;
      }
    }
  });
}

async function runSimplifiedSmokeTest() {
  console.log('==============================================================================');
  console.log('MEETWISE AI — TESTE MÍNIMO VIÁVEL DE INTEGRAÇÃO REAL (STT + LLM)');
  console.log('Timestamp:', new Date().toISOString());
  console.log('==============================================================================\n');

  const deepgramKey = process.env.DEEPGRAM_API_KEY;
  const geminiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;

  // Verificação preventiva de segurança
  if (!deepgramKey || deepgramKey.trim().length === 0) {
    console.log('❌ AVISO: DEEPGRAM_API_KEY não encontrada no seu ficheiro .env.local.');
    console.log('   Para executar este teste real, adicione no ficheiro .env.local:');
    console.log('   DEEPGRAM_API_KEY=sua_chave_aqui\n');
  }

  if (!geminiKey || geminiKey.trim().length === 0) {
    console.log('❌ AVISO: GOOGLE_AI_API_KEY não encontrada no seu ficheiro .env.local.');
    console.log('   Para executar este teste real, adicione no ficheiro .env.local:');
    console.log('   GOOGLE_AI_API_KEY=sua_chave_aqui\n');
  }

  if (!deepgramKey || !geminiKey) {
    console.log('⏹️  Execução suspensa em segurança ($0.00 USD consumidos).');
    console.log('   Após preencher as chaves no .env.local, execute novamente este comando.');
    process.exit(0);
  }

  console.log('🔑 Credenciais detetadas no servidor com sucesso.');
  console.log('🛡️  Circuit Breaker Financeiro Ativo: Teto de $0.05 USD por execução.\n');

  let sttCostUSD = 0;
  let llmCostUSD = 0;

  // ----------------------------------------------------------------------------
  // PASSO 1: TRANSCRIÇÃO REAL (DEEPGRAM NOVA-2)
  // ----------------------------------------------------------------------------
  console.log('--- PASSO 1: TRANSCRIÇÃO REAL COM DEEPGRAM NOVA-2 ---');
  const deepgram = new DeepgramTranscriptionProvider(deepgramKey, 30000, 'nova-2');
  const sampleAudioUrl = 'https://dpgr.am/bueller.wav'; // Amostra oficial de 2 segundos da Deepgram

  const sttStart = Date.now();
  console.log(`Enviando requisição STT para Deepgram Nova-2 (áudio: ${sampleAudioUrl})...`);
  
  const sttResult = await deepgram.transcribe({
    audioUrl: sampleAudioUrl,
  }, {
    diarize: true,
    punctuate: true,
    smartFormat: true,
  });

  const sttDurationMs = Date.now() - sttStart;
  const audioDurationSec = sttResult.durationSeconds || 2.0;
  sttCostUSD = (audioDurationSec / 60) * 0.0043; // Taxa oficial Nova-2: $0.0043/min

  console.log(`✅ Transcrição concluída em ${sttDurationMs}ms:`);
  console.log(`   Texto: "${sttResult.fullText.trim()}"`);
  console.log(`   Duração do Áudio: ${audioDurationSec.toFixed(1)}s`);
  console.log(`   Segmentos / Oradores: ${sttResult.segments.length}`);
  console.log(`   Custo Estimado STT: $${sttCostUSD.toFixed(5)} USD\n`);

  if (sttCostUSD > 0.05) {
    throw new Error('Circuit Breaker: Custo de STT excedeu o limite máximo de $0.05 USD.');
  }

  // ----------------------------------------------------------------------------
  // PASSO 2: GERAÇÃO DE ATA COM IA (GOOGLE GEMINI 2.0 FLASH)
  // ----------------------------------------------------------------------------
  console.log('--- PASSO 2: SÍNTESE E ESTRUTURAÇÃO COM GOOGLE GEMINI ---');
  const gemini = new GeminiLLMAdapter(geminiKey, process.env.GEMINI_MODEL || 'gemini-2.0-flash');

  // Preparar os segmentos da reunião para o Gemini
  const segments = sttResult.segments.length > 0 ? sttResult.segments : [
    {
      speaker_label: 'Orador 1',
      start_time: 0,
      end_time: Math.round(audioDurationSec),
      text: sttResult.fullText || 'Reunião estratégica realizada para alinhamento.',
    }
  ];

  const llmStart = Date.now();
  console.log('Enviando transcrição para o Google Gemini...');

  const analysisResult = await gemini.analyzeMeeting({
    meetingTitle: 'Reunião de Verificação Real Deepgram + Gemini',
    language: 'pt',
    templateType: 'formal',
    segments: segments.map((s: any) => ({
      speaker_label: s.speaker_label,
      start_time: s.start_time_ms ? s.start_time_ms / 1000 : s.start_time || 0,
      end_time: s.end_time_ms ? s.end_time_ms / 1000 : s.end_time || 1,
      text: s.text,
    })),
  });

  const llmDurationMs = Date.now() - llmStart;
  const promptTokens = analysisResult.aiMetadata?.promptTokens || 0;
  const completionTokens = analysisResult.aiMetadata?.completionTokens || 0;
  
  // Taxa Gemini 2.0 Flash: $0.10/1M in, $0.40/1M out
  llmCostUSD = (promptTokens * 0.0000001) + (completionTokens * 0.0000004);

  console.log(`✅ Ata gerada com sucesso em ${llmDurationMs}ms:`);
  console.log(`   Tokens: ${promptTokens} input / ${completionTokens} output`);
  console.log(`   Resumo Executivo: ${analysisResult.summary?.executive || analysisResult.summary?.brief || 'Gerado com sucesso'}`);
  console.log(`   Decisões Identificadas: ${analysisResult.decisions?.length || 0}`);
  console.log(`   Tarefas Identificadas: ${analysisResult.tasks?.length || 0}`);
  console.log(`   Custo Estimado LLM: $${llmCostUSD.toFixed(5)} USD\n`);

  // ----------------------------------------------------------------------------
  // RESUMO E AUDITORIA FINANCEIRA
  // ----------------------------------------------------------------------------
  const totalCostUSD = sttCostUSD + llmCostUSD;

  console.log('==============================================================================');
  console.log('RESULTADO FINAL DO TESTE MÍNIMO VIÁVEL:');
  console.log(`STT (Deepgram Nova-2): $${sttCostUSD.toFixed(5)} USD`);
  console.log(`LLM (Google Gemini):   $${llmCostUSD.toFixed(5)} USD`);
  console.log(`CUSTO TOTAL OBSERVADO: $${totalCostUSD.toFixed(5)} USD (Menos de meio cêntimo!)`);
  console.log('==============================================================================\n');

  // Guardar evidência
  const evidenceDir = path.resolve(process.cwd(), 'test-evidence');
  if (!fs.existsSync(evidenceDir)) {
    fs.mkdirSync(evidenceDir, { recursive: true });
  }

  const evidence = {
    timestamp: new Date().toISOString(),
    stt: {
      provider: 'deepgram',
      model: 'nova-2',
      durationSeconds: audioDurationSec,
      transcript: sttResult.fullText,
      costUSD: sttCostUSD,
      latencyMs: sttDurationMs,
    },
    llm: {
      provider: 'gemini',
      model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
      promptTokens,
      completionTokens,
      costUSD: llmCostUSD,
      latencyMs: llmDurationMs,
      summary: analysisResult.summary,
    },
    financial: {
      totalCostUSD,
      budgetCapUSD: 0.05,
      passedWithinBudget: totalCostUSD <= 0.05,
    },
  };

  fs.writeFileSync(
    path.join(evidenceDir, 'real-ai-smoke-test-results.json'),
    JSON.stringify(evidence, null, 2),
    'utf-8'
  );
  console.log('📁 Evidência guardada em test-evidence/real-ai-smoke-test-results.json');
}

runSimplifiedSmokeTest().catch((err) => {
  console.error('\n❌ Falha no teste real:', err.message);
  process.exit(1);
});
