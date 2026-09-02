import { deepEqual } from 'node:assert/strict';

type Core = {
  startGroup(name: string): void;
  endGroup(): void;
  info(message: string): void;
};

type Exec = {
  exec(
    commandLine: string,
    args?: string[],
    options?: { ignoreReturnCode?: boolean; silent?: boolean }
  ): Promise<number>;
};

type BuildImagesOptions = {
  core: Core;
  exec: Exec;
  imagesJson: string;
  tag: string;
};

type BuildPlanItem = {
  name: string;
  image: string;
  args: string[];
};

export function buildPlan(imagesJson: string, tag: string): BuildPlanItem[] {
  let images: unknown;

  try {
    images = JSON.parse(imagesJson);
  } catch {
    throw new Error('images must be valid JSON');
  }

  if (!Array.isArray(images) || images.length === 0) {
    throw new Error('images must be a non-empty JSON array');
  }
  if (!/^pr-[1-9][0-9]*-[0-9a-f]{40,64}$/.test(tag)) {
    throw new Error('image tag must contain a pull-request number and commit SHA');
  }

  return images.map((value, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`images[${index}] must be an object`);
    }

    const image = value as Record<string, unknown>;
    for (const field of ['name', 'image', 'context', 'dockerfile']) {
      if (typeof image[field] !== 'string' || image[field].trim() === '') {
        throw new Error(`images[${index}].${field} must be a non-empty string`);
      }
    }
    if (image.build_args != null && typeof image.build_args !== 'string') {
      throw new Error(`images[${index}].build_args must be a string`);
    }

    const name = image.name as string;
    const repository = image.image as string;
    const context = image.context as string;
    const dockerfile = image.dockerfile as string;
    const buildArgs = (image.build_args as string | undefined) ?? '';
    const taggedImage = `${repository}:${tag}`;
    const args = [
      'buildx',
      'build',
      '--file',
      dockerfile,
      '--tag',
      taggedImage,
      '--push'
    ];

    for (const buildArg of buildArgs.split(/\r?\n/).map(value => value.trim()).filter(Boolean)) {
      args.push('--build-arg', buildArg);
    }

    args.push(context);
    return { name, image: taggedImage, args };
  });
}

export async function buildImages({
  core,
  exec,
  imagesJson,
  tag
}: BuildImagesOptions): Promise<void> {
  for (const image of buildPlan(imagesJson, tag)) {
    core.startGroup(`Build ${image.name}`);
    try {
      const exists = await exec.exec(
        'docker',
        ['buildx', 'imagetools', 'inspect', image.image],
        { ignoreReturnCode: true, silent: true }
      );
      if (exists === 0) {
        core.info(`Reusing ${image.image}`);
        continue;
      }

      await exec.exec('docker', image.args);
    } finally {
      core.endGroup();
    }
  }
}

if (process.argv[1] === __filename) {
  const tag = `pr-42-${'a'.repeat(40)}`;
  deepEqual(
    buildPlan(
      JSON.stringify([
        {
          name: 'web',
          image: 'acme/web',
          context: './web',
          dockerfile: './web/Dockerfile',
          build_args: 'APP_ENV=preview\nEMPTY='
        }
      ]),
      tag
    ),
    [
      {
        name: 'web',
        image: `acme/web:${tag}`,
        args: [
          'buildx',
          'build',
          '--file',
          './web/Dockerfile',
          '--tag',
          `acme/web:${tag}`,
          '--push',
          '--build-arg',
          'APP_ENV=preview',
          '--build-arg',
          'EMPTY=',
          './web'
        ]
      }
    ]
  );

  const commands: string[][] = [];
  void buildImages({
    core: { startGroup() {}, endGroup() {}, info() {} },
    exec: {
      async exec(_command, args) {
        commands.push(args ?? []);
        return 0;
      }
    },
    imagesJson: JSON.stringify([
      {
        name: 'web',
        image: 'acme/web',
        context: './web',
        dockerfile: './web/Dockerfile'
      }
    ]),
    tag
  }).then(() =>
    deepEqual(commands, [['buildx', 'imagetools', 'inspect', `acme/web:${tag}`]])
  );
}
