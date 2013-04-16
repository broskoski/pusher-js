describe("ProtocolWrapper", function() {
  var transport;
  var wrapper;

  beforeEach(function() {
    transport = Pusher.Mocks.getTransport(true);
    transport.send = jasmine.createSpy("send").andReturn(true);
    transport.close = jasmine.createSpy("close");

    wrapper = new Pusher.ProtocolWrapper(transport);
  });

  describe("#supportsPing", function() {
    it("should return true if transport supports ping", function() {
      transport.supportsPing.andReturn(true);
      expect(wrapper.supportsPing()).toBe(true);
    });

    it("should return false if transport does not support ping", function() {
      transport.supportsPing.andReturn(false);
      expect(wrapper.supportsPing()).toBe(false);
    });
  });

  describe("#initialize", function() {
    it("should call initialize on transport", function() {
      wrapper.initialize();
      expect(transport.initialize).toHaveBeenCalled();
    });

    it("should transition to 'initialized' after transport has been initialized", function() {
      var onInitialized = jasmine.createSpy("onInitialized");

      wrapper.bind("initialized", onInitialized);
      wrapper.initialize();
      transport.state = "initialized";

      expect(onInitialized).not.toHaveBeenCalled();
      transport.emit("initialized");

      expect(onInitialized).toHaveBeenCalled();
    });
  });

  describe("#close", function() {
    it("should call close on the transport", function() {
      wrapper.close();
      expect(transport.close).toHaveBeenCalled();
    });
  });

  describe("after initialization", function() {
    beforeEach(function() {
      wrapper.initialize();
      transport.state = "initialized";
      transport.emit("initialized");
    });

    describe("#connect", function() {
      it("should call connect on transport", function() {
        wrapper.connect();
        expect(transport.connect).toHaveBeenCalled();
      });
    });

    it("should transition to 'connecting' after transport has started connecting", function() {
      var onConnecting = jasmine.createSpy("onConnecting");
      wrapper.bind("connecting", onConnecting);

      wrapper.connect();
      expect(onConnecting).not.toHaveBeenCalled();
      transport.state = "connecting";
      transport.emit("connecting");

      expect(onConnecting).toHaveBeenCalled();
    });
  });

  describe("after transport has been opened", function() {
    beforeEach(function() {
      wrapper.connect();
      transport.state = "open";
      transport.emit("open");
    });

    it("should not transition to 'open' before receiving a message or close code", function() {
      var onOpen = jasmine.createSpy("onOpen");
      wrapper.bind("open", onOpen);

      wrapper.connect();
      transport.state = "open";
      transport.emit("open");

      expect(onOpen).not.toHaveBeenCalled();
    });
  });

  describe("after receiving pusher:connection_established", function() {
    beforeEach(function() {
      wrapper.connect();
      transport.state = "open";
      transport.emit("open");
    });

    it("should transition to 'open' and then to 'connected'", function() {
      var onOpen = jasmine.createSpy("onOpen").andCallFake(function() {
        expect(wrapper.state).toEqual("open");
        expect(onConnected).not.toHaveBeenCalled();
      });
      var onConnected = jasmine.createSpy("onConnected");
      wrapper.bind("open", onOpen);
      wrapper.bind("connected", onConnected);

      expect(onConnected).not.toHaveBeenCalled();

      transport.emit("message", {
        data: JSON.stringify({
          event: "pusher:connection_established",
          data: {
            socket_id: "123.456"
          }
        })
      });

      expect(onOpen).toHaveBeenCalled();
      expect(onConnected).toHaveBeenCalledWith("123.456");
      expect(wrapper.state).toEqual("connected");
    });
  });

  describe("after receiving pusher:error on connection attempt", function() {
    beforeEach(function() {
      wrapper.connect();
      transport.state = "open";
      transport.emit("open");
    });

    it("should transition to 'open' and then emit 'ssl_only'", function() {
      var onOpen = jasmine.createSpy("onOpen").andCallFake(function() {
        expect(wrapper.state).toEqual("open");
        expect(onConnected).not.toHaveBeenCalled();
      });
      var onConnected = jasmine.createSpy("onConnected");
      var onSSLOnly = jasmine.createSpy("onSSLOnly");
      wrapper.bind("open", onOpen);
      wrapper.bind("ssl_only", onSSLOnly);
      wrapper.bind("connected", onConnected);

      transport.emit("message", {
        data: JSON.stringify({
          event: "pusher:error",
          data: {
            code: 4000,
            message: "SSL only"
          }
        })
      });

      expect(onConnected).not.toHaveBeenCalled();
      expect(onOpen).toHaveBeenCalled();
      expect(onSSLOnly).toHaveBeenCalled();
      expect(transport.close).toHaveBeenCalled();
    });

    it("should close the transport", function() {
      transport.emit("message", {
        data: JSON.stringify({
          event: "pusher:error",
          data: {
            code: 4000,
            message: "SSL only"
          }
        })
      });

      expect(transport.close).toHaveBeenCalled();
    });
  });

  describe("after receiving a close code on connection attempt", function() {
    beforeEach(function() {
      wrapper.connect();
      transport.state = "open";
      transport.emit("open");
    });

    it("should transition to 'open' and then emit 'backoff' after receiving close code 1002", function() {
      var onOpen = jasmine.createSpy("onOpen").andCallFake(function() {
        expect(wrapper.state).toEqual("open");
        expect(onBackoff).not.toHaveBeenCalled();
      });
      var onBackoff = jasmine.createSpy("onBackoff");
      wrapper.bind("backoff", onBackoff);
      wrapper.bind("open", onOpen);

      transport.emit("closed", {
        code: 1002,
        reason: "protocol error"
      });

      expect(onOpen).toHaveBeenCalled();
      expect(onBackoff).toHaveBeenCalled();
    });

    it("should not transition to connected", function() {
      var onConnected = jasmine.createSpy("onConnected");
      wrapper.bind("connected", onConnected);

      transport.emit("closed", {
        code: 4000,
        reason: "ERROR"
      });

      expect(onConnected).not.toHaveBeenCalled();
    });

    it("should not call close on the transport", function() {
      transport.emit("closed", {
        code: 4100,
        reason: "ERROR"
      });

      expect(transport.close).not.toHaveBeenCalled();
    });

    it("should emit 'ssl_only' when receiving close code 4000", function() {
      var onSSLOnly = jasmine.createSpy("onSSLOnly");
      var onClosed = jasmine.createSpy("onClosed");
      wrapper.bind("ssl_only", onSSLOnly);
      wrapper.bind("closed", onClosed);

      transport.emit("closed", {
        code: 4000,
        reason: "SSL only"
      });

      expect(onSSLOnly).toHaveBeenCalled();
      expect(onClosed.calls.length).toEqual(1);
    });

    it("should emit an error after receiving close code 4000", function() {
      var onError = jasmine.createSpy("onError");
      wrapper.bind("error", onError);

      transport.emit("closed", {
        code: 4000,
        reason: "SSL only"
      });

      expect(onError).toHaveBeenCalledWith({
        type: "PusherError",
        data: {
          code: 4000,
          message: "SSL only"
        }
      });
    });

    it("should emit 'refused' when receiving 4001-4099 close code", function() {
      var onConnected = jasmine.createSpy("onConnected");
      var onRefused = jasmine.createSpy("onRefused");
      wrapper.bind("refused", onRefused);
      wrapper.bind("connected", onConnected);

      transport.emit("closed", {
        code: 4069,
        reason: "refused"
      });

      expect(onConnected).not.toHaveBeenCalled();
      expect(onRefused).toHaveBeenCalled();
    });

    it("should emit an error after receiving close code 4001-4099", function() {
      var onError = jasmine.createSpy("onError");
      wrapper.bind("error", onError);

      transport.emit("closed", {
        code: 4096,
        reason: "refused"
      });

      expect(onError).toHaveBeenCalledWith({
        type: "PusherError",
        data: {
          code: 4096,
          message: "refused"
        }
      });
    });

    it("should emit 'backoff' when receiving 4100-4199 close code", function() {
      var onConnected = jasmine.createSpy("onConnected");
      var onBackoff = jasmine.createSpy("onBackoff");
      wrapper.bind("backoff", onBackoff);
      wrapper.bind("connected", onConnected);

      transport.emit("closed", {
        code: 4100,
        reason: "backoff"
      });

      expect(onConnected).not.toHaveBeenCalled();
      expect(onBackoff).toHaveBeenCalled();
    });

    it("should emit an error after receiving close code 4100-4199", function() {
      var onError = jasmine.createSpy("onError");
      wrapper.bind("error", onError);

      transport.emit("closed", {
        code: 4111,
        reason: "backoff"
      });

      expect(onError).toHaveBeenCalledWith({
        type: "PusherError",
        data: {
          code: 4111,
          message: "backoff"
        }
      });
    });

    it("should emit 'retry' when receiving 4200-4299 close code", function() {
      var onConnected = jasmine.createSpy("onConnected");
      var onRetry = jasmine.createSpy("onRetry");
      wrapper.bind("retry", onRetry);
      wrapper.bind("connected", onConnected);

      transport.emit("closed", {
        code: 4299,
        reason: "retry"
      });

      expect(onConnected).not.toHaveBeenCalled();
      expect(onRetry).toHaveBeenCalled();
    });

    it("should emit an error after receiving close code 4200-4299", function() {
      var onError = jasmine.createSpy("onError");
      wrapper.bind("error", onError);

      transport.emit("closed", {
        code: 4234,
        reason: "retry"
      });

      expect(onError).toHaveBeenCalledWith({
        type: "PusherError",
        data: {
          code: 4234,
          message: "retry"
        }
      });
    });

    it("should emit 'refused' when receiving unknown close code", function() {
      var onConnected = jasmine.createSpy("onConnected");
      var onRefused = jasmine.createSpy("onRefused");
      wrapper.bind("refused", onRefused);
      wrapper.bind("connected", onConnected);

      transport.emit("closed", {
        code: 4301,
        reason: "refused"
      });

      expect(onConnected).not.toHaveBeenCalled();
      expect(onRefused).toHaveBeenCalled();
    });

    it("should emit an error after receiving unknown close code", function() {
      var onError = jasmine.createSpy("onError");
      wrapper.bind("error", onError);

      transport.emit("closed", {
        code: 4301,
        reason: "weird"
      });

      expect(onError).toHaveBeenCalledWith({
        type: "PusherError",
        data: {
          code: 4301,
          message: "weird"
        }
      });
    });
  });

  describe("after connecting successfully", function() {
    beforeEach(function() {
      wrapper.connect();
      transport.state = "open";
      transport.emit("open");

      transport.emit("message", {
        data: JSON.stringify({
          event: "pusher:connection_established",
          data: {
            socket_id: "123.456"
          }
        })
      });
    });

    describe("#send", function() {
      it("should pass the data to the transport", function() {
        transport.send.andReturn(true);
        wrapper.send("proxy");
        expect(transport.send).toHaveBeenCalledWith("proxy");
      });

      it("should return true if the transport sent the data", function() {
        transport.send.andReturn(true);
        expect(wrapper.send("proxy")).toBe(true);
      });

      it("should return false if the transport did not send the data", function() {
        transport.send.andReturn(false);
        expect(wrapper.send("proxy")).toBe(false);
      });

      it("should send events in correct format", function() {
        expect(wrapper.send_event("test", [1,2,3])).toBe(true);
        expect(transport.send).toHaveBeenCalledWith(JSON.stringify({
          event: "test",
          data: [1,2,3]
        }));
      });

      it("should send events in correct format (including channel)", function() {
        wrapper.send_event("test", [1,2,3], "chan");
        expect(transport.send).toHaveBeenCalledWith(JSON.stringify({
          event: "test",
          data: [1,2,3],
          channel: "chan"
        }));
      });
    });

    describe("after receiving 'ping_request' event", function() {
      it("should emit 'ping_request' too", function() {
        var onPingRequest = jasmine.createSpy("onPingRequest");
        wrapper.bind("ping_request", onPingRequest);

        transport.emit("ping_request");

        expect(onPingRequest).toHaveBeenCalled();
      });
    });

    describe("after receiving a message", function() {
      it("should emit general messages", function() {
        var onMessage = jasmine.createSpy("onMessage");
        wrapper.bind("message", onMessage);

        transport.emit("message", {
          data: JSON.stringify({
            event: "random",
            data: { foo: "bar" }
          })
        });
        expect(onMessage).toHaveBeenCalledWith({
          event: "random",
          data: { foo: "bar" }
        });
      });

      it("should emit errors", function() {
        var onError = jasmine.createSpy("onError");
        wrapper.bind("error", onError);

        transport.emit("message", {
          data: JSON.stringify({
            event: "pusher:error",
            data: ":("
          })
        });
        expect(onError).toHaveBeenCalledWith({
          type: "PusherError",
          data: ":("
        });
      });

      it("should emit ping", function() {
        var onPing = jasmine.createSpy("onPing");
        wrapper.bind("ping", onPing);

        transport.emit("message", {
          data: JSON.stringify({
            event: "pusher:ping",
            data: {}
          })
        });
        expect(onPing).toHaveBeenCalled();
      });

      it("should emit pong", function() {
        var onPong = jasmine.createSpy("onPong");
        wrapper.bind("pong", onPong);

        transport.emit("message", {
          data: JSON.stringify({
            event: "pusher:pong",
            data: {}
          })
        });
        expect(onPong).toHaveBeenCalled();
      });

      it("should emit an error after receiving invalid JSON", function() {
        var error = {};

        var onMessage = jasmine.createSpy("onMessage");
        var onError = jasmine.createSpy("onError").andCallFake(function(e) {
          error = e;
        });
        wrapper.bind("message", onMessage);
        wrapper.bind("error", onError);

        transport.emit("message", {
          data: "this is not json"
        });
        expect(onMessage).not.toHaveBeenCalled();
        expect(error.type).toEqual("MessageParseError");
        expect(error.data).toEqual("this is not json");
      });
    });

    describe("on connection close", function() {
      it("should emit closed", function() {
        var onClosed = jasmine.createSpy("onClosed");
        wrapper.bind("closed", onClosed);

        transport.emit("closed");
        expect(onClosed).toHaveBeenCalled();
      });

      it("should not emit 'refused' when receiving close code 1000", function() {
        var onRefused = jasmine.createSpy("onRefused");
        var onClosed = jasmine.createSpy("onClosed");
        wrapper.bind("refused", onRefused);
        wrapper.bind("closed", onClosed);

        transport.emit("closed", {
          code: 1000,
          reason: "normal"
        });

        expect(onRefused).not.toHaveBeenCalled();
        expect(onClosed.calls.length).toEqual(1);
      });

      it("should not emit an error after receiving close code 1000", function() {
        var onError = jasmine.createSpy("onError");
        wrapper.bind("error", onError);

        transport.emit("closed", {
          code: 1000,
          reason: "normal"
        });

        expect(onError).not.toHaveBeenCalled();
      });

      it("should not emit an error after receiving close code 1001", function() {
        var onError = jasmine.createSpy("onError");
        wrapper.bind("error", onError);

        transport.emit("closed", {
          code: 1001,
          reason: "going away"
        });

        expect(onError).not.toHaveBeenCalled();
      });

      it("should emit 'backoff' when receiving close code 1002", function() {
        var onConnected = jasmine.createSpy("onConnected");
        var onBackoff = jasmine.createSpy("onBackoff");
        wrapper.bind("backoff", onBackoff);
        wrapper.bind("connected", onConnected);

        transport.emit("closed", {
          code: 1002,
          reason: "protocol error"
        });

        expect(onConnected).not.toHaveBeenCalled();
        expect(onBackoff).toHaveBeenCalled();
      });

      it("should emit an error after receiving close code 1002, but before emitting backoff", function() {
        var onError = jasmine.createSpy("onError").andCallFake(function() {
          expect(onBackoff).not.toHaveBeenCalled();
        });
        var onBackoff = jasmine.createSpy("onBackoff");
        wrapper.bind("backoff", onBackoff);
        wrapper.bind("error", onError);

        transport.emit("closed", {
          code: 1002,
          reason: "protocol error"
        });

        expect(onError).toHaveBeenCalledWith({
          type: "PusherError",
          data: {
            code: 1002,
            message: "protocol error"
          }
        });
      });
    });
  });

  describe("after receiving a transport error", function() {
    it("should emit the error", function() {
      var onError = jasmine.createSpy("onError");
      wrapper.bind("error", onError);

      transport.emit("error", "wut");
      expect(onError).toHaveBeenCalledWith({
        type: "WebSocketError",
        error: "wut"
      });
    });
  });
});
