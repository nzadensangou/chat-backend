// Seed database - Test data
import bcryptjs from 'bcryptjs';
import { logger } from '../logger.js';

/**
 * Seed version
 */
export const version = '002_seed_test_data';

/**
 * Seed description
 */
export const description = 'Insert test data for development and testing';

/**
 * Generate test data
 */
const generateTestData = async () => {
  const salt = await bcryptjs.genSalt(10);
  const passwordHash = await bcryptjs.hash('Test@123456', salt);

  return {
    countries: [
      { shell: 'France', prefix: '+33', timeZone: 'Europe/Paris', decallageHoraire: 1 },
      { shell: 'Belgique', prefix: '+32', timeZone: 'Europe/Brussels', decallageHoraire: 1 },
      { shell: 'Suisse', prefix: '+41', timeZone: 'Europe/Zurich', decallageHoraire: 1 },
      { shell: 'Sénégal', prefix: '+221', timeZone: 'Africa/Dakar', decallageHoraire: 0 },
      { shell: 'Côte d\'Ivoire', prefix: '+225', timeZone: 'Africa/Abidjan', decallageHoraire: 0 },
      { shell: 'Cameroun', prefix: '+237', timeZone: 'Africa/Douala', decallageHoraire: 0 },
    ],
    users: [
      {
        phoneNumber: '+33612345678',
        username: 'alice_dev',
        email: 'alice@example.com',
        nom: 'Alice Martin',
        pseudo: 'Alice',
        idPays: 1,
        passwordHash,
        passwordSalt: salt,
        avatarUrl: 'https://i.pravatar.cc/150?img=1',
        typeCompte: 'personal',
      },
      {
        phoneNumber: '+33687654321',
        username: 'bob_dev',
        email: 'bob@example.com',
        nom: 'Bob Dupont',
        pseudo: 'Bob',
        idPays: 1,
        passwordHash,
        passwordSalt: salt,
        avatarUrl: 'https://i.pravatar.cc/150?img=2',
        typeCompte: 'personal',
      },
      {
        phoneNumber: '+33756432109',
        username: 'charlie_dev',
        email: 'charlie@example.com',
        nom: 'Charlie Laurent',
        pseudo: 'Charlie',
        idPays: 1,
        passwordHash,
        passwordSalt: salt,
        avatarUrl: 'https://i.pravatar.cc/150?img=3',
        typeCompte: 'personal',
      },
      {
        phoneNumber: '+32491234567',
        username: 'diana_dev',
        email: 'diana@example.com',
        nom: 'Diana Schmidt',
        pseudo: 'Diana',
        idPays: 2,
        passwordHash,
        passwordSalt: salt,
        avatarUrl: 'https://i.pravatar.cc/150?img=4',
        typeCompte: 'personal',
      },
      {
        phoneNumber: '+221771234567',
        username: 'emma_dev',
        email: 'emma@example.com',
        nom: 'Emma Ba',
        pseudo: 'Emma',
        idPays: 4,
        passwordHash,
        passwordSalt: salt,
        avatarUrl: 'https://i.pravatar.cc/150?img=5',
        typeCompte: 'business',
      },
      {
        phoneNumber: '+237612345678',
        username: 'frank_dev',
        email: 'frank@example.com',
        nom: 'Frank Kamga',
        pseudo: 'Frank',
        idPays: 6,
        passwordHash,
        passwordSalt: salt,
        avatarUrl: 'https://i.pravatar.cc/150?img=6',
        typeCompte: 'personal',
      },
    ],
    contacts: [
      { userId: 1, friendId: 2 },
      { userId: 1, friendId: 3 },
      { userId: 1, friendId: 4 },
      { userId: 1, friendId: 6 },
      { userId: 2, friendId: 1 },
      { userId: 2, friendId: 3 },
      { userId: 3, friendId: 1 },
      { userId: 3, friendId: 2 },
      { userId: 4, friendId: 1 },
      { userId: 6, friendId: 1 },
    ],
  };
};

/**
 * Execute seed (insert test data)
 * @param {mysql2.Pool} pool - MySQL connection pool
 * @returns {Promise<object>} Results of seeding
 */
export const up = async (pool) => {
  try {
    const data = await generateTestData();
    const results = { countries: 0, users: 0, contacts: 0 };

    // Insert countries
    for (const country of data.countries) {
      try {
        await pool.query(
          `INSERT INTO pays (shell, prefix, timeZone, decallageHoraire) VALUES (?, ?, ?, ?)`,
          [country.shell, country.prefix, country.timeZone, country.decallageHoraire]
        );
        results.countries++;
      } catch (err) {
        if (!err.message.includes('Duplicate entry')) {
          throw err;
        }
      }
    }

    // Insert users
    for (const user of data.users) {
      try {
        await pool.query(
          `INSERT INTO users (phoneNumber, username, email, nom, pseudo, idPays, passwordHash, passwordSalt, avatarUrl, typeCompte)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            user.phoneNumber,
            user.username,
            user.email,
            user.nom,
            user.pseudo,
            user.idPays,
            user.passwordHash,
            user.passwordSalt,
            user.avatarUrl,
            user.typeCompte,
          ]
        );
        results.users++;
      } catch (err) {
        if (!err.message.includes('Duplicate entry')) {
          throw err;
        }
      }
    }

    // Insert contacts
    for (const contact of data.contacts) {
      try {
        await pool.query(
          `INSERT INTO preferredContact (alanyaID, idFriend) VALUES (?, ?)`,
          [contact.userId, contact.friendId]
        );
        results.contacts++;
      } catch (err) {
        if (!err.message.includes('Duplicate entry')) {
          throw err;
        }
      }
    }

    logger.info(results, 'Seed data inserted successfully');

    return results;
  } catch (err) {
    logger.error(err, 'Seed data insertion failed');
    throw err;
  }
};

/**
 * Rollback seed (delete test data)
 * @param {mysql2.Pool} pool - MySQL connection pool
 * @returns {Promise<boolean>} Success status
 */
export const down = async (pool) => {
  try {
    const deleteQueries = [
      'DELETE FROM preferredContact WHERE alanyaID > 0',
      'DELETE FROM messages WHERE senderId > 0',
      'DELETE FROM conv_participants WHERE id > 0',
      'DELETE FROM conversation WHERE conversationId > 0',
      'DELETE FROM participant WHERE id > 0',
      'DELETE FROM meeting WHERE idMeeting > 0',
      'DELETE FROM callHistory WHERE idCall > 0',
      'DELETE FROM statusViewer WHERE id > 0',
      'DELETE FROM statusReport WHERE id > 0',
      'DELETE FROM statusHiddenFrom WHERE id > 0',
      'DELETE FROM status WHERE statusId > 0',
      'DELETE FROM messageReadReceipts WHERE id > 0',
      'DELETE FROM blocked WHERE idBlock > 0',
      'DELETE FROM userAccess WHERE idLogin > 0',
      'DELETE FROM users WHERE alanyaID > 0',
      'DELETE FROM pays WHERE idPays > 0',
    ];

    for (const query of deleteQueries) {
      await pool.query(query);
    }

    logger.info('Seed data deleted successfully');
    return true;
  } catch (err) {
    logger.error(err, 'Seed data deletion failed');
    throw err;
  }
};

/**
 * Seed metadata
 */
export const seed = {
  version,
  description,
  dataCount: {
    countries: 6,
    users: 6,
    contacts: 10,
  },
  testUsers: [
    { username: 'alice_dev', password: 'Test@123456', phone: '+33612345678' },
    { username: 'bob_dev', password: 'Test@123456', phone: '+33687654321' },
    { username: 'charlie_dev', password: 'Test@123456', phone: '+33756432109' },
    { username: 'diana_dev', password: 'Test@123456', phone: '+32491234567' },
    { username: 'emma_dev', password: 'Test@123456', phone: '+221771234567' },
    { username: 'frank_dev', password: 'Test@123456', phone: '+237612345678' },
  ],
};

export default {
  version,
  description,
  up,
  down,
  seed,
};