import { withMethodHandlers } from '../../lib/withLogging';

export default withMethodHandlers({
  GET: async (req, res) => {
    return res.status(200).json({
      status: 'success',
      message: 'API is healthy',
      timestamp: new Date().toISOString(),
    });
  },
});
