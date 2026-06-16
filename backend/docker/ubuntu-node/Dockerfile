FROM ubuntu:22.04

# Prevent interactive prompts during apt package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install required networking, debugging, and text editing tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    iproute2 \
    net-tools \
    curl \
    wget \
    git \
    nano \
    vim \
    less \
    procps \
    dnsutils \
    iputils-ping \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Keeping container running. 
# In Dockerode/Docker, Cmd/Tty/OpenStdin will keep the bash process open.
CMD ["/bin/bash"]
