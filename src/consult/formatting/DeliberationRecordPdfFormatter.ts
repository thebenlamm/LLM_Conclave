/**
 * DeliberationRecordPdfFormatter
 *
 * Renders a DeliberationRecordSource into a compliance-grade PDF using pdfkit.
 * Walks the SAME 8-field structure as DeliberationRecordFormatter (D-05) and
 * imports all locked strings from deliberationRecordConstants (D-06).
 *
 * Phase 21-02 — Plan 02: no LLM calls, no side effects, no re-parsing of markdown.
 *
 * Threat mitigations:
 *   T-21-01: sanitizeFraming applied to every LLM free-text value before draw.
 *   T-21-02: normalizeAccent validates hex and falls back to default (#222222).
 */

import PDFDocument from 'pdfkit';
import type { DeliberationRecordSource, OperatorInputs, BrandingInputs } from '../../types/deliberationRecord.js';
import {
  TITLE_TEXT,
  HEADING_TEXT,
  DISCLAIMER,
  FIELD6_INTRO,
  FIELD6_NONE_SURFACED,
  FIELD6_NOT_PERSISTED,
  FIELD6_UNKNOWN,
  MITIGATION_PLACEHOLDER,
  sanitizeFraming,
} from './deliberationRecordConstants.js';

const BODY_FONT_SIZE = 10;
const HEADING_FONT_SIZE = 13;
const CHROME_FONT_SIZE = 9;
const DEFAULT_ACCENT = '#222222';

export class DeliberationRecordPdfFormatter {
  /**
   * Render the 8-field Deliberation Record as a PDF Buffer.
   * Branding is optional — omitting it yields a neutral default header and a valid PDF.
   */
  render(
    source: DeliberationRecordSource,
    operator: OperatorInputs,
    branding?: BrandingInputs
  ): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const accent = this.normalizeAccent(branding?.accentColor);
      const orgLabel = branding?.companyName?.trim() || TITLE_TEXT;
      const footerText = branding?.footerText ?? '';

      // pdfVersion '1.4' keeps the XRef table as a flat cross-reference table
      // (PDF spec §7.5.4). pdfkit 0.19.x defaults to 1.5+ compressed streams
      // which pdf.js v1.10.100 (bundled in pdf-parse 1.1.4) cannot parse.
      const doc = new PDFDocument({
        size: 'A4',
        pdfVersion: '1.4',
        margins: { top: 72, bottom: 64, left: 64, right: 64 },
        info: {
          Title: TITLE_TEXT,
          Author: operator.operatorName,
          Subject: TITLE_TEXT,
          Creator: 'LLM Conclave',
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Repeating header/footer (D-01). The first page is added before we can
      // attach the event handler, so we call drawChrome() once explicitly too.
      const drawChrome = (): void => {
        const margins = doc.page.margins;
        const contentWidth = doc.page.width - margins.left - margins.right;

        // Header: orgLabel in accent color
        doc
          .font('Helvetica-Bold')
          .fontSize(CHROME_FONT_SIZE)
          .fillColor(accent)
          .text(orgLabel, margins.left, 28, {
            width: contentWidth,
            align: 'left',
            lineBreak: false,
          });

        // Footer: footerText (if supplied)
        if (footerText) {
          doc
            .font('Helvetica')
            .fontSize(8)
            .fillColor('#888888')
            .text(footerText, margins.left, doc.page.height - 36, {
              width: contentWidth,
              align: 'left',
              lineBreak: false,
            });
        }

        // Reset cursor to content area start after drawing chrome
        doc.x = margins.left;
        doc.y = margins.top;
      };

      doc.on('pageAdded', drawChrome);
      // Explicit first-page chrome — pageAdded already fired during construction
      drawChrome();

      this.writeBody(doc, source, operator, accent);
      doc.end();
    });
  }

  /**
   * Write the 8 Deliberation Record fields into the document.
   * Branching logic mirrors DeliberationRecordFormatter exactly (D-05).
   * sanitizeFraming is applied to every LLM-sourced string (T-21-01).
   */
  private writeBody(
    doc: PDFKit.PDFDocument,
    source: DeliberationRecordSource,
    operator: OperatorInputs,
    accent: string
  ): void {
    const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    const heading = (text: string): void => {
      doc
        .moveDown(0.6)
        .font('Helvetica-Bold')
        .fontSize(HEADING_FONT_SIZE)
        .fillColor(accent)
        .text(text, { width: contentWidth });
      doc
        .moveDown(0.2)
        .font('Helvetica')
        .fontSize(BODY_FONT_SIZE)
        .fillColor('#000000');
    };

    const body = (text: string): void => {
      doc
        .font('Helvetica')
        .fontSize(BODY_FONT_SIZE)
        .fillColor('#000000')
        .text(text, { width: contentWidth });
    };

    const bullet = (text: string): void => {
      doc
        .font('Helvetica')
        .fontSize(BODY_FONT_SIZE)
        .fillColor('#000000')
        .text('• ' + text, { width: contentWidth - 16, indent: 16 });
    };

    // ----------------------------------------------------------------
    // Field 1: Decision Framed
    // ----------------------------------------------------------------
    heading(HEADING_TEXT.field1);
    body(sanitizeFraming(source.decision.question));
    if (source.decision.context) {
      doc.moveDown(0.3);
      body('Context: ' + sanitizeFraming(source.decision.context));
    }
    if (source.decision.constraints && source.decision.constraints.length > 0) {
      doc.moveDown(0.3);
      body('Constraints:');
      for (const c of source.decision.constraints) {
        bullet(sanitizeFraming(c));
      }
    }

    // ----------------------------------------------------------------
    // Field 2: Panel Composition & Rationale
    // ----------------------------------------------------------------
    heading(HEADING_TEXT.field2);
    if (operator.panelRationale) {
      body('Rationale: ' + operator.panelRationale);
      doc.moveDown(0.3);
    }
    body('Panel members:');
    for (const member of source.panel) {
      const persona = member.persona ? ` — ${member.persona}` : '';
      bullet(`${member.name}: ${member.provider} / ${member.model}${persona}`);
    }

    // ----------------------------------------------------------------
    // Field 3: Positions Summarized
    // ----------------------------------------------------------------
    heading(HEADING_TEXT.field3);
    if (source.positions.length > 0) {
      for (const pos of source.positions) {
        if (pos.stance) {
          bullet(`${pos.agent}: ${sanitizeFraming(pos.stance)}`);
        } else {
          bullet(`${pos.agent}: (position not individually persisted in stored session)`);
        }
      }
    } else {
      body('(No individual positions recorded.)');
    }

    // ----------------------------------------------------------------
    // Field 4: Dissent (Attributed) — 4-way branch (mirrors L83-105 of markdown formatter)
    // ----------------------------------------------------------------
    heading(HEADING_TEXT.field4);
    if (source.dissents.length > 0) {
      // Attributed dissents available (consult path)
      for (const d of source.dissents) {
        const severityStr = d.severity ? ` (${d.severity})` : '';
        bullet(`${d.agent}${severityStr}: ${sanitizeFraming(d.concern)}`);
      }
    } else if (source.dissentQuality !== undefined) {
      // Discuss path: dissent_quality set but no individual dissents persisted
      body(
        `Dissent quality: ${source.dissentQuality} — no individually attributed dissent persisted in the stored session; operator to confirm.`
      );
    } else if (source.sourceMode === 'discuss') {
      // CR-01: discuss path with NO persisted dissent signal
      body(
        '(No dissent signal was persisted in this stored session; dissent presence is unknown — operator to confirm.)'
      );
    } else {
      // Genuine clean consensus — consult path with no attributed dissent
      body('(No dissent recorded — genuine consensus reached.)');
    }

    // ----------------------------------------------------------------
    // Field 5: Synthesis & Recommendation
    // ----------------------------------------------------------------
    heading(HEADING_TEXT.field5);
    body(sanitizeFraming(source.synthesis) || '(No synthesis recorded.)');

    // ----------------------------------------------------------------
    // Field 6: Risks Surfaced & Human Mitigation
    // (mirrors Field-4 branching for N1 consistency)
    // ----------------------------------------------------------------
    heading(HEADING_TEXT.field6);
    body(FIELD6_INTRO);
    doc.moveDown(0.3);
    if (source.dissents.length > 0) {
      for (const d of source.dissents) {
        const mitigations = operator.mitigations ?? {};
        const mitigation = mitigations[d.concern] ?? MITIGATION_PLACEHOLDER;
        body(`Risk: ${sanitizeFraming(d.concern)}`);
        body(`Mitigation: ${mitigation}`);
        doc.moveDown(0.2);
      }
    } else if (source.dissentQuality !== undefined) {
      body(FIELD6_NOT_PERSISTED(source.dissentQuality));
    } else if (source.sourceMode === 'discuss') {
      body(FIELD6_UNKNOWN);
    } else {
      body(FIELD6_NONE_SURFACED);
    }

    // ----------------------------------------------------------------
    // Field 7: Decision-Support Disclaimer (locked — verbatim)
    // ----------------------------------------------------------------
    heading(HEADING_TEXT.field7);
    body(DISCLAIMER);

    // ----------------------------------------------------------------
    // Field 8: Provenance
    // ----------------------------------------------------------------
    heading(HEADING_TEXT.field8);
    body(`Run by: ${operator.operatorName}`);
    body(`Date: ${source.provenance.date}`);
    body('Panel:');
    for (const agent of source.provenance.agents) {
      bullet(`${agent.name}: ${agent.provider} / ${agent.model}`);
    }
  }

  /**
   * Validate a hex color string. Returns a valid #RRGGBB string or the default.
   * Never throws — arbitrary operator input never reaches the color sink unvalidated (T-21-02).
   */
  private normalizeAccent(hex?: string): string {
    if (!hex) return DEFAULT_ACCENT;
    const trimmed = hex.trim();
    if (/^#[0-9A-Fa-f]{6}$/.test(trimmed)) return trimmed;
    return DEFAULT_ACCENT;
  }
}
