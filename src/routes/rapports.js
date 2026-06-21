const express = require('express');
const PDFDocument = require('pdfkit');
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun, WidthType, AlignmentType } = require('docx');
const { TYPE_LABEL, PERIODE_LABEL, logosEnTete, recupererDonnees, perimetreLabel } = require('../utils/rapports-data');

const router = express.Router();

const COULEUR_BG = '#0B1F3A';
const COULEUR_VERT = '#009639';
const COULEUR_JAUNE = '#FCD116';
const COULEUR_BLEU = '#3A75C4';

function dessinerEntete(doc, { periode, entite }) {
  doc.rect(0, 0, doc.page.width, 8).fill(COULEUR_VERT);
  doc.rect(doc.page.width / 3, 0, doc.page.width / 3, 8).fill(COULEUR_JAUNE);
  doc.rect((doc.page.width / 3) * 2, 0, doc.page.width / 3, 8).fill(COULEUR_BLEU);

  const logos = logosEnTete(entite);
  let logoX = 40;
  const tailleLogo = 42;
  logos.forEach((logo) => {
    try {
      doc.image(logo.chemin, logoX, 22, { width: tailleLogo, height: tailleLogo, fit: [tailleLogo, tailleLogo] });
    } catch {
      // logo illisible : on ignore silencieusement plutôt que de faire échouer le rapport
    }
    logoX += tailleLogo + 10;
  });

  const titreX = logos.length ? logoX + 10 : 40;

  doc.fillColor(COULEUR_BG)
    .fontSize(18)
    .text('AlertCitoyen — République Gabonaise', titreX, 26, { align: 'left' });

  doc.fontSize(12).fillColor('#333333')
    .text(`Rapport d'activité — ${PERIODE_LABEL[periode] || periode}`, titreX, 50);

  doc.fontSize(9).fillColor('#666666')
    .text(`Périmètre : ${perimetreLabel(entite)}`, titreX, 68)
    .text(`Généré le ${new Date().toLocaleString('fr-FR')}`, titreX, 80);

  doc.moveTo(40, 102).lineTo(doc.page.width - 40, 102).strokeColor('#CCCCCC').stroke();

  return 116;
}

function dessinerResume(doc, donnees, y) {
  doc.fontSize(14).fillColor(COULEUR_BG).text('Résumé', 40, y);
  const cartes = [
    { label: 'Alertes sur la période', valeur: String(donnees.total) },
    { label: 'Taux de résolution', valeur: `${donnees.tauxResolution} %` },
    { label: 'Temps de réponse moyen', valeur: donnees.tempsReponseMoyen != null ? `${donnees.tempsReponseMoyen} min` : 'N/A' },
    { label: 'Alertes résolues', valeur: String(donnees.resolues) },
  ];

  let x = 40;
  const largeurCarte = (doc.page.width - 80) / 4;
  cartes.forEach((carte) => {
    doc.roundedRect(x, y + 22, largeurCarte - 10, 56, 4).strokeColor('#DDDDDD').stroke();
    doc.fontSize(16).fillColor(COULEUR_BG).text(carte.valeur, x + 8, y + 30, { width: largeurCarte - 20 });
    doc.fontSize(8).fillColor('#666666').text(carte.label, x + 8, y + 54, { width: largeurCarte - 20 });
    x += largeurCarte;
  });

  return y + 100;
}

function dessinerTableau(doc, titre, lignes, colonnes, y) {
  doc.fontSize(14).fillColor(COULEUR_BG).text(titre, 40, y);
  y += 24;

  doc.fontSize(9).fillColor('#666666');
  doc.text(colonnes[0], 40, y);
  doc.text(colonnes[1], 300, y);
  y += 16;
  doc.moveTo(40, y).lineTo(doc.page.width - 40, y).strokeColor('#DDDDDD').stroke();
  y += 8;

  doc.fontSize(10).fillColor('#222222');
  if (!lignes.length) {
    doc.text('Aucune donnée pour cette période.', 40, y);
    return y + 24;
  }

  lignes.forEach(([label, valeur]) => {
    doc.text(label, 40, y, { width: 240 });
    doc.text(String(valeur), 300, y);
    y += 18;
  });

  return y + 16;
}

router.get('/pdf', (req, res) => {
  const periode = ['jour', 'semaine', 'mois'].includes(req.query.periode) ? req.query.periode : 'jour';
  const entite = req.query.entite || null;

  const donnees = recupererDonnees({ periode, entite });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="rapport_alertcitoyen_${periode}.pdf"`);

  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  doc.pipe(res);

  const yEntete = dessinerEntete(doc, { periode, entite });
  let y = dessinerResume(doc, donnees, yEntete + 14);

  const parTypeLignes = donnees.parType.map(([type, count]) => [TYPE_LABEL[type] || type, count]);
  y = dessinerTableau(doc, 'Alertes par type', parTypeLignes, ['Type', 'Nombre'], y);

  const zonesLignes = donnees.zonesARisque.map(([quartier, count]) => [quartier, count]);
  dessinerTableau(doc, 'Zones à risque (quartiers les plus signalés)', zonesLignes, ['Quartier', "Nombre d'alertes"], y);

  doc.fontSize(8).fillColor('#999999')
    .text('AlertCitoyen — République Gabonaise — Document généré automatiquement', 40, doc.page.height - 40);

  doc.end();
});

function ligneTableauWord(label, valeur, enTete = false) {
  const styleTexte = enTete ? { bold: true, color: 'FFFFFF' } : {};
  return new TableRow({
    children: [
      new TableCell({
        width: { size: 70, type: WidthType.PERCENTAGE },
        shading: enTete ? { fill: '0B1F3A' } : undefined,
        children: [new Paragraph({ children: [new TextRun({ text: String(label), ...styleTexte })] })],
      }),
      new TableCell({
        width: { size: 30, type: WidthType.PERCENTAGE },
        shading: enTete ? { fill: '0B1F3A' } : undefined,
        children: [new Paragraph({ children: [new TextRun({ text: String(valeur), ...styleTexte })] })],
      }),
    ],
  });
}

function tableauWord(titreColonnes, lignes) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      ligneTableauWord(titreColonnes[0], titreColonnes[1], true),
      ...(lignes.length
        ? lignes.map(([label, valeur]) => ligneTableauWord(label, valeur))
        : [ligneTableauWord('Aucune donnée pour cette période', '—')]),
    ],
  });
}

router.get('/docx', async (req, res) => {
  const periode = ['jour', 'semaine', 'mois'].includes(req.query.periode) ? req.query.periode : 'jour';
  const entite = req.query.entite || null;

  const donnees = recupererDonnees({ periode, entite });
  const logos = logosEnTete(entite);

  const fs = require('fs');
  const enteteEnfants = [];

  if (logos.length) {
    enteteEnfants.push(
      new Paragraph({
        children: logos.map((logo) => new ImageRun({
          data: fs.readFileSync(logo.chemin),
          transformation: { width: 50, height: 50 },
        })),
        spacing: { after: 200 },
      })
    );
  }

  enteteEnfants.push(
    new Paragraph({
      children: [new TextRun({ text: 'AlertCitoyen — République Gabonaise', bold: true, size: 32, color: '0B1F3A' })],
    }),
    new Paragraph({
      children: [new TextRun({ text: `Rapport d'activité — ${PERIODE_LABEL[periode] || periode}`, size: 24 })],
      spacing: { after: 100 },
    }),
    new Paragraph({
      children: [new TextRun({ text: `Périmètre : ${perimetreLabel(entite)}`, size: 18, color: '666666' })],
    }),
    new Paragraph({
      children: [new TextRun({ text: `Généré le ${new Date().toLocaleString('fr-FR')}`, size: 18, color: '666666' })],
      spacing: { after: 300 },
    })
  );

  const docxDoc = new Document({
    sections: [{
      children: [
        ...enteteEnfants,
        new Paragraph({ children: [new TextRun({ text: 'Résumé', bold: true, size: 26, color: '0B1F3A' })], spacing: { after: 150 } }),
        tableauWord(['Indicateur', 'Valeur'], [
          ['Alertes sur la période', donnees.total],
          ['Taux de résolution', `${donnees.tauxResolution} %`],
          ['Temps de réponse moyen', donnees.tempsReponseMoyen != null ? `${donnees.tempsReponseMoyen} min` : 'N/A'],
          ['Alertes résolues', donnees.resolues],
        ]),
        new Paragraph({ text: '', spacing: { after: 300 } }),
        new Paragraph({ children: [new TextRun({ text: 'Alertes par type', bold: true, size: 26, color: '0B1F3A' })], spacing: { after: 150 } }),
        tableauWord(['Type', 'Nombre'], donnees.parType.map(([type, count]) => [TYPE_LABEL[type] || type, count])),
        new Paragraph({ text: '', spacing: { after: 300 } }),
        new Paragraph({ children: [new TextRun({ text: 'Zones à risque (quartiers les plus signalés)', bold: true, size: 26, color: '0B1F3A' })], spacing: { after: 150 } }),
        tableauWord(['Quartier', "Nombre d'alertes"], donnees.zonesARisque.map(([quartier, count]) => [quartier, count])),
        new Paragraph({ text: '', spacing: { after: 300 } }),
        new Paragraph({
          children: [new TextRun({ text: 'AlertCitoyen — République Gabonaise — Document généré automatiquement', size: 14, color: '999999' })],
        }),
      ],
    }],
  });

  const buffer = await Packer.toBuffer(docxDoc);

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="rapport_alertcitoyen_${periode}.docx"`);
  res.send(buffer);
});

module.exports = router;
