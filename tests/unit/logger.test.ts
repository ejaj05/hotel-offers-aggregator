import { LoggerService, LogLevel } from '../../src/services/logger.service';

describe('LoggerService', () => {
  let consoleSpyInfo: jest.SpyInstance;
  let consoleSpyWarn: jest.SpyInstance;
  let consoleSpyError: jest.SpyInstance;
  let consoleSpyDebug: jest.SpyInstance;

  beforeEach(() => {
    consoleSpyInfo = jest.spyOn(console, 'info').mockImplementation(() => {});
    consoleSpyWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    consoleSpyError = jest.spyOn(console, 'error').mockImplementation(() => {});
    consoleSpyDebug = jest.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs info messages with timestamp and default context', () => {
    const logger = new LoggerService('TestApp');
    logger.info('Test informational message');

    expect(consoleSpyInfo).toHaveBeenCalledTimes(1);
    const loggedMessage = consoleSpyInfo.mock.calls[0][0];
    expect(loggedMessage).toContain('[INFO]');
    expect(loggedMessage).toContain('[TestApp]');
    expect(loggedMessage).toContain('Test informational message');
  });

  it('supports child context tagging using forContext', () => {
    const rootLogger = new LoggerService('Root');
    const childLogger = rootLogger.forContext('HotelService');

    childLogger.warn('Potential pricing anomaly detected');

    expect(consoleSpyWarn).toHaveBeenCalledTimes(1);
    const loggedMessage = consoleSpyWarn.mock.calls[0][0];
    expect(loggedMessage).toContain('[WARN]');
    expect(loggedMessage).toContain('[HotelService]');
    expect(loggedMessage).toContain('Potential pricing anomaly detected');
  });

  it('includes metadata serialized as JSON in log output', () => {
    const logger = new LoggerService('Redis');
    logger.info('Cache key set', { key: 'hotels:kolkata', ttl: 60 });

    expect(consoleSpyInfo).toHaveBeenCalledTimes(1);
    const loggedMessage = consoleSpyInfo.mock.calls[0][0];
    expect(loggedMessage).toContain('{"key":"hotels:kolkata","ttl":60}');
  });

  it('formats errors and includes stack trace when Error instance is provided', () => {
    const logger = new LoggerService('ErrorHandler');
    const sampleError = new Error('Database connection failed');

    logger.error('Critical failure occurred', sampleError);

    expect(consoleSpyError).toHaveBeenCalledTimes(1);
    const loggedMessage = consoleSpyError.mock.calls[0][0];
    const stackOutput = consoleSpyError.mock.calls[0][1];

    expect(loggedMessage).toContain('[ERROR]');
    expect(loggedMessage).toContain('Critical failure occurred');
    expect(stackOutput).toContain('Database connection failed');
  });

  it('respects log level filtering', () => {
    process.env.LOG_LEVEL = 'WARN';
    const warnOnlyLogger = new LoggerService('Filtered');

    warnOnlyLogger.debug('Should not appear');
    warnOnlyLogger.info('Should not appear either');
    warnOnlyLogger.warn('Should appear');
    warnOnlyLogger.error('Should also appear');

    expect(consoleSpyDebug).not.toHaveBeenCalled();
    expect(consoleSpyInfo).not.toHaveBeenCalled();
    expect(consoleSpyWarn).toHaveBeenCalledTimes(1);
    expect(consoleSpyError).toHaveBeenCalledTimes(1);

    // Reset env
    delete process.env.LOG_LEVEL;
  });
});
