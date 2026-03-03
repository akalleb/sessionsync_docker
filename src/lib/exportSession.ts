import { toast } from 'sonner';
import type { IImageOptions } from 'docx';

interface ExportOptions {
    minutesContent: string;
    sessionTitle: string;
    camaraName?: string | null;
    camaraLogoUrl?: string | null;
}

/**
 * Detect image type from ArrayBuffer magic bytes.
 */
function detectImageType(buffer: ArrayBuffer): 'png' | 'jpg' | 'gif' | 'bmp' {
    const arr = new Uint8Array(buffer.slice(0, 4));
    // PNG: 89 50 4E 47
    if (arr[0] === 0x89 && arr[1] === 0x50 && arr[2] === 0x4e && arr[3] === 0x47) return 'png';
    // JPEG: FF D8 FF
    if (arr[0] === 0xff && arr[1] === 0xd8 && arr[2] === 0xff) return 'jpg';
    // GIF: 47 49 46
    if (arr[0] === 0x47 && arr[1] === 0x49 && arr[2] === 0x46) return 'gif';
    // BMP: 42 4D
    if (arr[0] === 0x42 && arr[1] === 0x4d) return 'bmp';
    return 'png'; // fallback
}

async function fetchLogoArrayBuffer(logoUrl: string): Promise<ArrayBuffer | null> {
    try {
        const response = await fetch(logoUrl);
        if (response.ok) return await response.arrayBuffer();
    } catch (e) {
        console.error('Erro ao carregar logo:', e);
    }
    return null;
}

async function fetchLogoDataUrl(logoUrl: string): Promise<string | null> {
    try {
        const response = await fetch(logoUrl);
        if (response.ok) {
            const blob = await response.blob();
            return await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.onerror = () => reject(reader.error);
                reader.readAsDataURL(blob);
            });
        }
    } catch (e) {
        console.error('Erro ao carregar logo para PDF:', e);
    }
    return null;
}

export async function exportToDocx(options: ExportOptions): Promise<void> {
    const { minutesContent, sessionTitle, camaraName, camaraLogoUrl } = options;

    const { Document, Packer, Paragraph, TextRun, AlignmentType, ImageRun } = await import('docx');
    const { saveAs } = await import('file-saver');

    let logoArrayBuffer: ArrayBuffer | null = null;
    let logoType: 'png' | 'jpg' | 'gif' | 'bmp' = 'png';

    if (camaraLogoUrl) {
        logoArrayBuffer = await fetchLogoArrayBuffer(camaraLogoUrl);
        if (logoArrayBuffer) {
            logoType = detectImageType(logoArrayBuffer);
        }
    }

    const paragraphs = minutesContent.split('\n').map(line => {
        const cleanLine = line.trim();

        if (cleanLine.startsWith('# ')) {
            return new Paragraph({
                children: [new TextRun({
                    text: cleanLine.replace('# ', ''),
                    bold: true,
                    size: 32,
                    font: "Times New Roman"
                })],
                alignment: AlignmentType.CENTER,
                spacing: { before: 400, after: 200 }
            });
        }
        else if (cleanLine.startsWith('## ')) {
            return new Paragraph({
                children: [new TextRun({
                    text: cleanLine.replace('## ', ''),
                    bold: true,
                    size: 28,
                    font: "Times New Roman"
                })],
                spacing: { before: 300, after: 150 }
            });
        }
        else if (cleanLine.startsWith('**') && cleanLine.endsWith('**')) {
            return new Paragraph({
                children: [new TextRun({
                    text: cleanLine.replace(/\*\*/g, ''),
                    bold: true,
                    size: 24,
                    font: "Times New Roman"
                })],
                spacing: { before: 200, after: 100 }
            });
        }

        const parts = line.split(/(\*\*.*?\*\*)/g);
        const textRuns = parts.map(part => {
            if (part.startsWith('**') && part.endsWith('**')) {
                return new TextRun({
                    text: part.slice(2, -2),
                    bold: true,
                    size: 24,
                    font: "Times New Roman"
                });
            }
            return new TextRun({
                text: part,
                size: 24,
                font: "Times New Roman"
            });
        });

        return new Paragraph({
            children: textRuns,
            spacing: { after: 100 }
        });
    });

    const children = [];

    if (logoArrayBuffer) {
        const imageOptions: IImageOptions = {
            data: logoArrayBuffer,
            transformation: { width: 80, height: 80 },
            type: logoType,
        };
        children.push(
            new Paragraph({
                children: [new ImageRun({ ...imageOptions })],
                alignment: AlignmentType.CENTER,
                spacing: { after: 200 },
            })
        );
    }

    if (camaraName) {
        children.push(
            new Paragraph({
                children: [
                    new TextRun({
                        text: camaraName.toUpperCase(),
                        bold: true,
                        size: 26,
                        font: "Times New Roman",
                    }),
                ],
                alignment: AlignmentType.CENTER,
                spacing: { after: 100 },
            })
        );
    }

    children.push(...paragraphs);

    const doc = new Document({
        sections: [{ properties: {}, children }],
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, `Ata-${sessionTitle.replace(/\s+/g, '-')}.docx`);
    toast.success('Download do Word iniciado!');
}

export async function exportToPdf(options: ExportOptions): Promise<void> {
    const { minutesContent, sessionTitle, camaraName, camaraLogoUrl } = options;

    const pdfMakeModule = await import('pdfmake/build/pdfmake');
    const pdfFontsModule = await import('pdfmake/build/vfs_fonts');

    const pdfMake = pdfMakeModule.default;
    const pdfFonts = pdfFontsModule.default;

    interface PdfMakeWithVfs {
        vfs: Record<string, string>;
        createPdf: (docDefinition: unknown) => { download: (filename: string) => void };
    }

    const pdfMakeInstance = pdfMake as unknown as PdfMakeWithVfs;
    const pdfFontsAny = pdfFonts as unknown as { vfs?: Record<string, string>; pdfMake?: { vfs: Record<string, string> } };

    if (pdfFontsAny.pdfMake && pdfFontsAny.pdfMake.vfs) {
        pdfMakeInstance.vfs = pdfFontsAny.pdfMake.vfs;
    } else if (pdfFontsAny.vfs) {
        pdfMakeInstance.vfs = pdfFontsAny.vfs;
    }

    let logoDataUrl: string | null = null;
    if (camaraLogoUrl) {
        logoDataUrl = await fetchLogoDataUrl(camaraLogoUrl);
    }

    const headerContent: unknown[] = [];

    if (logoDataUrl || camaraName) {
        const columns: unknown[] = [];

        if (logoDataUrl) {
            columns.push({
                image: logoDataUrl,
                width: 60,
                margin: [0, 0, 10, 0],
            });
        }

        columns.push({
            stack: [
                { text: camaraName || 'Câmara Municipal', style: 'camaraName' },
                { text: 'Ata de Sessão Legislativa', style: 'camaraSubtitle' },
            ],
            alignment: 'center',
        });

        headerContent.push({ columns, margin: [0, 0, 0, 12] });
    }

    const bodyContent = minutesContent.split('\n').map(line => {
        const cleanLine = line.trim();

        if (cleanLine.startsWith('# ')) {
            return {
                text: cleanLine.replace('# ', ''),
                style: 'header1',
                margin: [0, 10, 0, 5]
            };
        } else if (cleanLine.startsWith('## ')) {
            return {
                text: cleanLine.replace('## ', ''),
                style: 'header2',
                margin: [0, 8, 0, 4]
            };
        }

        const parts = line.split(/(\*\*.*?\*\*)/g);
        const textObjects = parts.map(part => {
            if (part.startsWith('**') && part.endsWith('**')) {
                return { text: part.slice(2, -2), bold: true };
            }
            return { text: part };
        });

        const validParts = textObjects.filter(p => p.text);

        if (validParts.length === 0) return { text: '\n' };

        return {
            text: validParts,
            margin: [0, 0, 0, 2],
            lineHeight: 1.2
        };
    });

    const docDefinition = {
        content: [...headerContent, ...bodyContent],
        styles: {
            header1: { fontSize: 14, bold: true, alignment: 'center', font: 'Roboto' },
            header2: { fontSize: 12, bold: true, font: 'Roboto' },
            camaraName: { fontSize: 12, bold: true, alignment: 'center', font: 'Roboto' },
            camaraSubtitle: { fontSize: 10, alignment: 'center', font: 'Roboto' }
        },
        defaultStyle: { fontSize: 10, font: 'Roboto' }
    };

    pdfMakeInstance.createPdf(docDefinition).download(`Ata-${sessionTitle.replace(/\s+/g, '-')}.pdf`);
    toast.success('Download do PDF iniciado!');
}

export async function handleExport(
    format: 'pdf' | 'docx',
    options: ExportOptions
): Promise<void> {
    if (!options.minutesContent) {
        toast.error('Não há conteúdo para exportar.');
        return;
    }

    toast.info(`Gerando arquivo ${format.toUpperCase()}...`);

    try {
        if (format === 'docx') {
            await exportToDocx(options);
        } else {
            await exportToPdf(options);
        }
    } catch (error) {
        console.error('Export error:', error);
        toast.error('Erro ao gerar arquivo.');
    }
}
