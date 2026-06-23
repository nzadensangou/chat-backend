/**
 * Seed: Countries
 * - Load initial countries data
 * - Run: npx knex seed:run
 */

export async function seed(knex) {
  // Insert seed data with explicit idPays
  await knex('pays').insert([
    { idPays: 1, libelle: 'Cameroun', prefix: '+237', timeZone: 'Africa/Douala', decalageHoraire: 1 },
    { idPays: 2, libelle: 'Côte d\'Ivoire', prefix: '+225', timeZone: 'Africa/Abidjan', decalageHoraire: 0 },
    { idPays: 3, libelle: 'Senegal', prefix: '+221', timeZone: 'Africa/Dakar', decalageHoraire: 0 },
    { idPays: 4, libelle: 'Mali', prefix: '+223', timeZone: 'Africa/Bamako', decalageHoraire: 0 },
    { idPays: 5, libelle: 'Nigeria', prefix: '+234', timeZone: 'Africa/Lagos', decalageHoraire: 1 },
    { idPays: 6, libelle: 'Tanzania', prefix: '+255', timeZone: 'Africa/Dar_es_Salaam', decalageHoraire: 3 },
    { idPays: 7, libelle: 'Kenya', prefix: '+254', timeZone: 'Africa/Nairobi', decalageHoraire: 3 },
    { idPays: 8, libelle: 'South Africa', prefix: '+27', timeZone: 'Africa/Johannesburg', decalageHoraire: 2 },
  ]);

  console.log('✅ Seeded countries table');
}