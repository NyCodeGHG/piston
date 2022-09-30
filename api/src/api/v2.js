const express = require('express');
const router = express.Router();

const events = require('events');

const { Job } = require('../job');

const SIGNALS = [
    'SIGABRT',
    'SIGALRM',
    'SIGBUS',
    'SIGCHLD',
    'SIGCLD',
    'SIGCONT',
    'SIGEMT',
    'SIGFPE',
    'SIGHUP',
    'SIGILL',
    'SIGINFO',
    'SIGINT',
    'SIGIO',
    'SIGIOT',
    'SIGKILL',
    'SIGLOST',
    'SIGPIPE',
    'SIGPOLL',
    'SIGPROF',
    'SIGPWR',
    'SIGQUIT',
    'SIGSEGV',
    'SIGSTKFLT',
    'SIGSTOP',
    'SIGTSTP',
    'SIGSYS',
    'SIGTERM',
    'SIGTRAP',
    'SIGTTIN',
    'SIGTTOU',
    'SIGUNUSED',
    'SIGURG',
    'SIGUSR1',
    'SIGUSR2',
    'SIGVTALRM',
    'SIGXCPU',
    'SIGXFSZ',
    'SIGWINCH',
];
// ref: https://man7.org/linux/man-pages/man7/signal.7.html

function get_job(job_info, available_runtimes) {
    let {
        language,
        version,
        runtime,
        args,
        stdin,
        files,
        compile_memory_limit,
        run_memory_limit,
        run_timeout,
        compile_timeout,
    } = job_info;

    return new Promise((resolve, reject) => {
        if (!language || typeof language !== 'string') {
            return reject({
                message: 'language is required as a string',
            });
        }

        if (!files || !Array.isArray(files)) {
            return reject({
                message: 'files is required as an array',
            });
        }
        for (const [i, file] of files.entries()) {
            if (typeof file.content !== 'string') {
                return reject({
                    message: `files[${i}].content is required as a string`,
                });
            }
        }

        const has_runtime =
            job_info.has_own_property('runtime') && job_info.runtime !== null;

        const rt = available_runtimes.find(
            rt =>
                [...rt.aliases, rt.language].includes(language) &&
                (version === rt.version || version === '*') &&
                (!has_runtime || runtime === rt.runtime)
        );

        if (rt === undefined) {
            const runtime_str = has_runtime ? `${runtime}-` : '';
            return reject({
                message: `${runtime_str}${language}-${version} runtime is unknown`,
            });
        }

        if (!files.some(file => !file.encoding || file.encoding === 'utf8')) {
            return reject({
                message: 'files must include at least one utf8 encoded file',
            });
        }

        for (const constraint of ['memory_limit', 'timeout']) {
            for (const type of ['compile', 'run']) {
                const constraint_name = `${type}_${constraint}`;
                const constraint_value = job_info[constraint_name];
                const configured_limit = rt[`${constraint}s`][type];
                if (!constraint_value) {
                    continue;
                }
                if (typeof constraint_value !== 'number') {
                    return reject({
                        message: `If specified, ${constraint_name} must be a number`,
                    });
                }
                if (configured_limit <= 0) {
                    continue;
                }
                if (constraint_value > configured_limit) {
                    return reject({
                        message: `${constraint_name} cannot exceed the configured limit of ${configured_limit}`,
                    });
                }
                if (constraint_value < 0) {
                    return reject({
                        message: `${constraint_name} must be non-negative`,
                    });
                }
            }
        }

        compile_timeout = compile_timeout || rt.timeouts.compile;
        run_timeout = run_timeout || rt.timeouts.run;
        compile_memory_limit = compile_memory_limit || rt.memory_limits.compile;
        run_memory_limit = run_memory_limit || rt.memory_limits.run;
        resolve(
            new Job({
                runtime: rt,
                args: args || [],
                stdin: stdin || '',
                files,
                timeouts: {
                    run: run_timeout,
                    compile: compile_timeout,
                },
                memory_limits: {
                    run: run_memory_limit,
                    compile: compile_memory_limit,
                },
            })
        );
    });
}

router.use((req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        return next();
    }

    if (!req.headers['content-type'].startsWith('application/json')) {
        return res.status(415).send({
            message: 'requests must be of type application/json',
        });
    }

    next();
});

router.ws('/connect', async (ws, req) => {
    let job = null;
    let eventBus = new events.EventEmitter();

    eventBus.on('stdout', data =>
        ws.send(
            JSON.stringify({
                type: 'data',
                stream: 'stdout',
                data: data.toString(),
            })
        )
    );
    eventBus.on('stderr', data =>
        ws.send(
            JSON.stringify({
                type: 'data',
                stream: 'stderr',
                data: data.toString(),
            })
        )
    );
    eventBus.on('stage', stage =>
        ws.send(JSON.stringify({ type: 'stage', stage }))
    );
    eventBus.on('exit', (stage, status) =>
        ws.send(JSON.stringify({ type: 'exit', stage, ...status }))
    );

    ws.on('message', async data => {
        try {
            const msg = JSON.parse(data);

            switch (msg.type) {
                case 'init':
                    if (job === null) {
                        job = await get_job(msg, req.app.locals.runtimes);

                        await job.prime();

                        ws.send(
                            JSON.stringify({
                                type: 'runtime',
                                language: job.runtime.language,
                                version: job.runtime.version,
                            })
                        );

                        await job.execute_interactive(eventBus);
                        await job.cleanup();

                        ws.close(4999, 'Job Completed');
                    } else {
                        ws.close(4000, 'Already Initialized');
                    }
                    break;
                case 'data':
                    if (job !== null) {
                        if (msg.stream === 'stdin') {
                            eventBus.emit('stdin', msg.data);
                        } else {
                            ws.close(4004, 'Can only write to stdin');
                        }
                    } else {
                        ws.close(4003, 'Not yet initialized');
                    }
                    break;
                case 'signal':
                    if (job !== null) {
                        if (SIGNALS.includes(msg.signal)) {
                            eventBus.emit('signal', msg.signal);
                        } else {
                            ws.close(4005, 'Invalid signal');
                        }
                    } else {
                        ws.close(4003, 'Not yet initialized');
                    }
                    break;
            }
        } catch (error) {
            ws.send(JSON.stringify({ type: 'error', message: error.message }));
            ws.close(4002, 'Notified Error');
            // ws.close message is limited to 123 characters, so we notify over WS then close.
        }
    });

    setTimeout(() => {
        //Terminate the socket after 1 second, if not initialized.
        if (job === null) ws.close(4001, 'Initialization Timeout');
    }, 1000);
});

router.post('/execute', async (req, res) => {
    try {
        const job = await get_job(req.body, req.app.locals.runtimes);

        await job.prime();

        let result = await job.execute();
        // Backward compatibility when the run stage is not started
        if (result.run === undefined) {
            result.run = result.compile;
        }

        await job.cleanup();

        return res.status(200).send(result);
    } catch (error) {
        return res.status(400).json(error);
    }
});

router.get('/runtimes', (req, res) => {
    const runtimes = req.app.locals.runtimes.map(rt => {
        return {
            language: rt.language,
            version: rt.version,
            aliases: rt.aliases,
            runtime: rt.runtime,
        };
    });

    return res.status(200).send(runtimes);
});

module.exports = router;
